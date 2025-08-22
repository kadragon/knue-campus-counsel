export interface RateLimitRecord {
  timestamps: number[];
  windowMs: number;
  maxRequests: number;
  lastAccess: number;
  metadata?: {
    userAgent?: string;
    endpoint?: string;
    flags?: string[];
    escalationLevel?: number;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
  resetTime: number;
  metadata?: {
    source: 'cache' | 'kv' | 'new';
    kvEnabled: boolean;
    escalated?: boolean;
  };
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  kvEnabled: boolean;
  memoryCacheSize: number;
  memoryCacheTTL: number;
  cleanupThreshold: number;
  cleanupInterval: number;
  adaptiveEnabled: boolean;
}

export interface KVStore {
  get(key: string): Promise<RateLimitRecord | null>;
  put(key: string, value: RateLimitRecord, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string, limit?: number): Promise<string[]>;
}