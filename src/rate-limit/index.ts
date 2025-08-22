import { HybridRateLimiter } from './hybrid-limiter.js';
import { CloudflareKVStore } from './kv-store.js';
import type { RateLimitConfig, RateLimitResult } from './types.js';

let rateLimiter: HybridRateLimiter | null = null;

export function initializeRateLimiter(kvNamespace: any, config: RateLimitConfig): void {
  if (rateLimiter) {
    rateLimiter.dispose();
  }
  
  const kvStore = new CloudflareKVStore(kvNamespace, config.adaptiveEnabled ? 'debug' : 'info');
  rateLimiter = new HybridRateLimiter(kvStore, config);
}

export async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number,
  metadata?: any
): Promise<RateLimitResult> {
  if (!rateLimiter) {
    throw new Error('Rate limiter not initialized. Call initializeRateLimiter first.');
  }
  
  return await rateLimiter.checkRequest(key, windowMs, maxRequests, metadata);
}

// 기존 allowRequest 함수와의 호환성을 위한 어댑터
export async function allowRequest(
  key: string,
  windowMs: number,
  max: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const result = await checkRateLimit(key, windowMs, max);
  return {
    allowed: result.allowed,
    retryAfterSec: result.retryAfterSec
  };
}

export async function cleanupRateLimit(): Promise<void> {
  if (rateLimiter) {
    await rateLimiter.cleanup();
  }
}

export function getRateLimiterStats(): any {
  if (!rateLimiter) {
    return null;
  }
  return rateLimiter.getMemoryStats();
}

export function disposeRateLimiter(): void {
  if (rateLimiter) {
    rateLimiter.dispose();
    rateLimiter = null;
  }
}

// 타입 재 export
export type { RateLimitConfig, RateLimitResult, RateLimitRecord } from './types.js';
export { CloudflareKVStore, MockKVStore } from './kv-store.js';
export { LRUCache } from './memory-cache.js';
export { HybridRateLimiter } from './hybrid-limiter.js';