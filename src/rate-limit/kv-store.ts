import { log } from '../utils.js';
import type { KVStore, RateLimitRecord } from './types.js';

export class CloudflareKVStore implements KVStore {
  constructor(
    private kv: any, // KVNamespace type은 runtime에만 사용 가능
    private logLevel: string = 'info'
  ) {}

  async get(key: string): Promise<RateLimitRecord | null> {
    try {
      const value = await this.kv.get(key, { type: 'json' });
      if (this.logLevel === 'debug') {
        log('debug', 'KV get operation', { key, found: !!value });
      }
      return value ? (value as RateLimitRecord) : null;
    } catch (error) {
      log('error', 'KV get failed', { 
        key, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null; // Fallback to memory-only
    }
  }

  async put(key: string, value: RateLimitRecord, ttl = 86400): Promise<void> {
    try {
      await this.kv.put(key, JSON.stringify(value), { 
        expirationTtl: ttl,
        metadata: { 
          lastUpdate: Date.now(),
          version: 'v1' 
        }
      });
      
      if (this.logLevel === 'debug') {
        log('debug', 'KV put operation', { key, ttl });
      }
    } catch (error) {
      log('error', 'KV put failed', { 
        key, 
        error: error instanceof Error ? error.message : String(error) 
      });
      // Continue without KV persistence - graceful degradation
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
      if (this.logLevel === 'debug') {
        log('debug', 'KV delete operation', { key });
      }
    } catch (error) {
      log('error', 'KV delete failed', { 
        key, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    try {
      const result = await this.kv.list({ prefix, limit });
      const keys = result.keys.map((k: any) => k.name);
      
      if (this.logLevel === 'debug') {
        log('debug', 'KV list operation', { prefix, count: keys.length, limit });
      }
      
      return keys;
    } catch (error) {
      log('error', 'KV list failed', { 
        prefix, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }
}

export class MockKVStore implements KVStore {
  public data = new Map<string, RateLimitRecord>();
  public shouldFail = false;

  async get(key: string): Promise<RateLimitRecord | null> {
    if (this.shouldFail) {
      throw new Error('Mock KV failure');
    }
    return this.data.get(key) || null;
  }

  async put(key: string, value: RateLimitRecord): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Mock KV failure');
    }
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Mock KV failure');
    }
    this.data.delete(key);
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    if (this.shouldFail) {
      throw new Error('Mock KV failure');
    }
    return Array.from(this.data.keys())
      .filter(key => key.startsWith(prefix))
      .slice(0, limit);
  }

  clear(): void {
    this.data.clear();
  }
}