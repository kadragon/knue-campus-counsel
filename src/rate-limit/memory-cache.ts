import { log } from '../utils.js';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 1000, ttl = 300000) { // 5분 TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    
    // TTL 체크
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // LRU: 접근 시 맨 뒤로 이동
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // 기존 키 제거 (재삽입을 위해)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // 크기 제한 확인
    if (this.cache.size >= this.maxSize) {
      // 가장 오래된 항목 제거 (첫 번째 항목)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // 만료된 항목 정리
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      log('debug', 'Memory cache cleanup completed', { 
        cleaned, 
        remaining: this.cache.size 
      });
    }
    
    return cleaned;
  }

  // 통계 정보
  getStats(): {
    size: number;
    maxSize: number;
    utilization: number;
    ttl: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: Math.round((this.cache.size / this.maxSize) * 100),
      ttl: this.ttl
    };
  }
}