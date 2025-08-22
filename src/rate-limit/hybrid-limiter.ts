import { log } from '../utils/index.js';
import { getMetrics } from '../metrics/metrics-registry.js';
import { LRUCache } from './memory-cache.js';
import type { KVStore, RateLimitRecord, RateLimitResult, RateLimitConfig } from './types.js';

export class HybridRateLimiter {
  private memoryCache: LRUCache<RateLimitRecord>;
  private kvStore: KVStore;
  private config: RateLimitConfig;
  private requestLocks: Map<string, boolean> = new Map();

  constructor(kvStore: KVStore, config: RateLimitConfig) {
    this.kvStore = kvStore;
    this.config = config;
    this.memoryCache = new LRUCache(config.memoryCacheSize, config.memoryCacheTTL);
  }

  async checkRequest(
    key: string, 
    windowMs: number, 
    maxRequests: number,
    metadata?: any
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const rlKey = this.generateKey(key);

    // Simple synchronization for concurrent requests to same key
    while (this.requestLocks.get(rlKey)) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    this.requestLocks.set(rlKey, true);

    try {
      return await this._processRequest(rlKey, key, windowMs, maxRequests, metadata, now);
    } finally {
      this.requestLocks.delete(rlKey);
    }
  }

  private async _processRequest(
    rlKey: string,
    key: string, 
    windowMs: number, 
    maxRequests: number,
    metadata: any,
    now: number
  ): Promise<RateLimitResult> {

    // 1. 메모리 캐시 확인
    let record = this.memoryCache.get(rlKey);
    let source: 'cache' | 'kv' | 'new' = record ? 'cache' : 'new';
    if (record) {
      try { getMetrics().incL1Hit() } catch {}
    }
    
    // 2. 캐시 미스 시 KV에서 로드
    if (!record && this.config.kvEnabled) {
      try {
        record = await this.kvStore.get(rlKey);
        if (record) {
          source = 'kv';
          this.memoryCache.set(rlKey, record);
        }
      } catch (error) {
        log('error', 'Failed to load from KV', { 
          key: rlKey, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    // 3. 레코드 초기화 (새 사용자)
    if (!record) {
      record = {
        timestamps: [],
        windowMs,
        maxRequests,
        lastAccess: now,
        metadata
      };
    }

    // 4. 데이터 무결성 검증 및 복구
    if (!Array.isArray(record.timestamps)) {
      log('error', 'Corrupted rate limit data detected, resetting', { key: rlKey });
      record.timestamps = [];
    }

    // 5. 윈도우 파라미터 업데이트 (기존 레코드의 설정 덮어쓰기)
    record.windowMs = windowMs;
    record.maxRequests = maxRequests;
    if (metadata) {
      record.metadata = metadata;
    }

    // 6. 윈도우 정리 및 요청 검증
    const windowStart = now - windowMs;
    record.timestamps = record.timestamps.filter(t => t > windowStart);
    
    // 7. Zero limit 처리
    if (maxRequests === 0) {
      const result: RateLimitResult = {
        allowed: false,
        retryAfterSec: Math.ceil(windowMs / 1000),
        remaining: 0,
        resetTime: now + windowMs,
        metadata: {
          source,
          kvEnabled: this.config.kvEnabled
        }
      };
      
      if (this.config.adaptiveEnabled) {
        result.metadata!.escalated = false;
      }
      
      return result;
    }

    const isAllowed = record.timestamps.length < maxRequests;
    const retryAfterSec = isAllowed 
      ? 0 
      : record.timestamps.length > 0
        ? Math.ceil((record.timestamps[0] + windowMs - now) / 1000)
        : Math.ceil(windowMs / 1000);

    if (isAllowed) {
      record.timestamps.push(now);
    }
    
    record.lastAccess = now;

    // 8. 캐시 업데이트
    this.memoryCache.set(rlKey, record);

    // 9. KV 저장 (Write-through) - await for testing consistency
    if (this.config.kvEnabled) {
      try {
        await this.persistToKV(rlKey, record);
      } catch (error) {
        log('error', 'KV persistence failed', { 
          key: rlKey, 
          error: error instanceof Error ? error.message : String(error) 
        });
        // Continue without throwing - graceful degradation
      }
    }

    const result: RateLimitResult = {
      allowed: isAllowed,
      retryAfterSec,
      remaining: Math.max(0, maxRequests - record.timestamps.length),
      resetTime: record.timestamps[0] ? record.timestamps[0] + windowMs : now + windowMs,
      metadata: {
        source,
        kvEnabled: this.config.kvEnabled
      }
    };

    try {
      if (isAllowed) getMetrics().incAllow(); else getMetrics().incDeny();
    } catch {}

    if (this.config.adaptiveEnabled && !isAllowed) {
      // 적응형 레이트 리밋 로직 (향후 구현)
      result.metadata!.escalated = false;
    }

    return result;
  }

  private generateKey(userKey: string): string {
    return `rl:v1:${userKey}`;
  }

  private async persistToKV(key: string, record: RateLimitRecord): Promise<void> {
    const ttl = Math.ceil((record.windowMs + 300000) / 1000); // 윈도우 + 5분 버퍼
    await this.kvStore.put(key, record, ttl);
  }


  // 메모리 캐시 직접 접근 (테스트용)
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  getMemoryStats(): any {
    return this.memoryCache.getStats();
  }

  // 리소스 정리
  dispose(): void {
    this.memoryCache.clear();
  }
}
