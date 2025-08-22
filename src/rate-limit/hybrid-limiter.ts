import { log } from '../utils.js';
import { LRUCache } from './memory-cache.js';
import type { KVStore, RateLimitRecord, RateLimitResult, RateLimitConfig } from './types.js';

export class HybridRateLimiter {
  private memoryCache: LRUCache<RateLimitRecord>;
  private kvStore: KVStore;
  private config: RateLimitConfig;
  private cleanupTimer?: any;

  constructor(kvStore: KVStore, config: RateLimitConfig) {
    this.kvStore = kvStore;
    this.config = config;
    this.memoryCache = new LRUCache(config.memoryCacheSize, config.memoryCacheTTL);
    
    // 주기적 정리 작업 스케줄링
    if (config.cleanupInterval > 0) {
      this.scheduleCleanup();
    }
  }

  async checkRequest(
    key: string, 
    windowMs: number, 
    maxRequests: number,
    metadata?: any
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const rlKey = this.generateKey(key);

    // 1. 메모리 캐시 확인
    let record = this.memoryCache.get(rlKey);
    let source: 'cache' | 'kv' | 'new' = record ? 'cache' : 'new';
    
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

    // 4. 윈도우 정리 및 요청 검증
    const windowStart = now - windowMs;
    record.timestamps = record.timestamps.filter(t => t > windowStart);
    
    const isAllowed = record.timestamps.length < maxRequests;
    const retryAfterSec = isAllowed 
      ? 0 
      : Math.ceil((record.timestamps[0] - windowStart) / 1000);

    if (isAllowed) {
      record.timestamps.push(now);
    }
    
    record.lastAccess = now;

    // 5. 캐시 업데이트
    this.memoryCache.set(rlKey, record);

    // 6. KV 비동기 저장 (Write-through)
    if (this.config.kvEnabled) {
      this.persistToKV(rlKey, record).catch(error => 
        log('error', 'KV persistence failed', { 
          key: rlKey, 
          error: error instanceof Error ? error.message : String(error) 
        })
      );
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

  // 백그라운드 정리 작업
  async cleanup(): Promise<void> {
    if (!this.config.kvEnabled) return;

    try {
      // 메모리 캐시 정리
      this.memoryCache.cleanup();

      // KV 정리
      const keys = await this.kvStore.list('rl:v1:', 100);
      const now = Date.now();
      let cleaned = 0;

      for (const key of keys) {
        try {
          const record = await this.kvStore.get(key);
          if (!record || now - record.lastAccess > this.config.cleanupThreshold) {
            await this.kvStore.delete(key);
            cleaned++;
          }
        } catch (error) {
          log('error', 'Cleanup failed for key', { 
            key, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }

      log('info', 'Rate limit cleanup completed', { 
        cleaned, 
        total: keys.length,
        memoryStats: this.memoryCache.getStats()
      });
    } catch (error) {
      log('error', 'Rate limit cleanup failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private scheduleCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => 
        log('error', 'Scheduled cleanup failed', { 
          error: error instanceof Error ? error.message : String(error) 
        })
      );
    }, this.config.cleanupInterval);
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
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.memoryCache.clear();
  }
}