import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CloudflareKVStore, MockKVStore } from '../../src/rate-limit/kv-store.js'
import type { RateLimitRecord } from '../../src/rate-limit/types.js'
import * as utils from '../../src/utils/index.js'

describe('KVStore implementations', () => {
  describe('MockKVStore', () => {
    let store: MockKVStore

    beforeEach(() => {
      store = new MockKVStore()
    })

    describe('Basic operations', () => {
      it('should store and retrieve records', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        await store.put('test-key', record)
        const retrieved = await store.get('test-key')
        
        expect(retrieved).toEqual(record)
      })

      it('should return null for non-existent keys', async () => {
        const result = await store.get('nonexistent')
        expect(result).toBeNull()
      })

      it('should delete keys', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        await store.put('test-key', record)
        expect(await store.get('test-key')).toEqual(record)
        
        await store.delete('test-key')
        expect(await store.get('test-key')).toBeNull()
      })

      it('should list keys with prefix', async () => {
        const record1: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }
        
        const record2: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 3000,
          maxRequests: 5,
          lastAccess: Date.now()
        }

        await store.put('rl:v1:user1', record1)
        await store.put('rl:v1:user2', record2)
        await store.put('other:key', record1)

        const keys = await store.list('rl:v1:', 10)
        expect(keys).toHaveLength(2)
        expect(keys).toContain('rl:v1:user1')
        expect(keys).toContain('rl:v1:user2')
        expect(keys).not.toContain('other:key')
      })

      it('should respect limit in list operation', async () => {
        for (let i = 0; i < 5; i++) {
          await store.put(`test:key${i}`, {
            timestamps: [Date.now()],
            windowMs: 5000,
            maxRequests: 10,
            lastAccess: Date.now()
          })
        }

        const keys = await store.list('test:', 3)
        expect(keys).toHaveLength(3)
      })

      it('should clear all data', () => {
        store.data.set('key1', {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        })
        store.data.set('key2', {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        })

        expect(store.data.size).toBe(2)
        store.clear()
        expect(store.data.size).toBe(0)
      })
    })

    describe('Error simulation', () => {
      it('should throw errors when shouldFail is true', async () => {
        store.shouldFail = true

        await expect(store.get('test-key')).rejects.toThrow('Mock KV failure')
        await expect(store.put('test-key', {} as RateLimitRecord)).rejects.toThrow('Mock KV failure')
        await expect(store.delete('test-key')).rejects.toThrow('Mock KV failure')
        await expect(store.list('test:')).rejects.toThrow('Mock KV failure')
      })

      it('should work normally when shouldFail is false', async () => {
        store.shouldFail = false

        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        await expect(store.put('test-key', record)).resolves.toBeUndefined()
        await expect(store.get('test-key')).resolves.toEqual(record)
        await expect(store.delete('test-key')).resolves.toBeUndefined()
        await expect(store.list('test:')).resolves.toEqual([])
      })
    })

    describe('Data integrity', () => {
      it('should handle complex record structures', async () => {
        const complexRecord: RateLimitRecord = {
          timestamps: [1000, 2000, 3000],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now(),
          metadata: {
            userAgent: 'test-agent',
            endpoint: 'telegram',
            flags: ['trusted', 'verified'],
            escalationLevel: 2
          }
        }

        await store.put('complex-key', complexRecord)
        const retrieved = await store.get('complex-key')
        
        expect(retrieved).toEqual(complexRecord)
        expect(retrieved?.metadata?.flags).toEqual(['trusted', 'verified'])
      })

      it('should maintain data consistency across operations', async () => {
        const records: RateLimitRecord[] = []
        
        // Create multiple records
        for (let i = 0; i < 10; i++) {
          const record: RateLimitRecord = {
            timestamps: Array.from({ length: i }, (_, j) => j * 1000),
            windowMs: 5000 + i,
            maxRequests: 10 + i,
            lastAccess: Date.now() + i
          }
          records.push(record)
          await store.put(`key${i}`, record)
        }

        // Verify all records
        for (let i = 0; i < 10; i++) {
          const retrieved = await store.get(`key${i}`)
          expect(retrieved).toEqual(records[i])
        }

        // Delete some records
        await store.delete('key2')
        await store.delete('key7')

        // Verify deletions
        expect(await store.get('key2')).toBeNull()
        expect(await store.get('key7')).toBeNull()
        
        // Verify remaining records are intact
        expect(await store.get('key0')).toEqual(records[0])
        expect(await store.get('key9')).toEqual(records[9])
      })
    })
  })

  describe('CloudflareKVStore', () => {
    let mockKV: any
    let store: CloudflareKVStore
    let logSpy: any

    beforeEach(() => {
      // Mock the log function from utils
      logSpy = vi.spyOn(utils, 'log').mockImplementation(() => {})

      // Create mock KV namespace
      mockKV = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      }

      store = new CloudflareKVStore(mockKV, 'debug')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    describe('Successful operations', () => {
      it('should handle get operations', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        mockKV.get.mockResolvedValue(record)
        
        const result = await store.get('test-key')
        
        expect(mockKV.get).toHaveBeenCalledWith('test-key', { type: 'json' })
        expect(result).toEqual(record)
      })

      it('should handle put operations with TTL', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        mockKV.put.mockResolvedValue(undefined)
        
        await store.put('test-key', record, 3600)
        
        expect(mockKV.put).toHaveBeenCalledWith(
          'test-key',
          JSON.stringify(record),
          {
            expirationTtl: 3600,
            metadata: expect.objectContaining({
              lastUpdate: expect.any(Number),
              version: 'v1'
            })
          }
        )
      })

      it('should handle put operations with default TTL', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        mockKV.put.mockResolvedValue(undefined)
        
        await store.put('test-key', record)
        
        expect(mockKV.put).toHaveBeenCalledWith(
          'test-key',
          JSON.stringify(record),
          {
            expirationTtl: 86400, // Default 24 hours
            metadata: expect.objectContaining({
              lastUpdate: expect.any(Number),
              version: 'v1'
            })
          }
        )
      })

      it('should handle delete operations', async () => {
        mockKV.delete.mockResolvedValue(undefined)
        
        await store.delete('test-key')
        
        expect(mockKV.delete).toHaveBeenCalledWith('test-key')
      })

      it('should handle list operations', async () => {
        const mockResult = {
          keys: [
            { name: 'rl:v1:user1' },
            { name: 'rl:v1:user2' }
          ]
        }
        
        mockKV.list.mockResolvedValue(mockResult)
        
        const keys = await store.list('rl:v1:', 10)
        
        expect(mockKV.list).toHaveBeenCalledWith({ prefix: 'rl:v1:', limit: 10 })
        expect(keys).toEqual(['rl:v1:user1', 'rl:v1:user2'])
      })

      it('should use default limit for list operations', async () => {
        const mockResult = { keys: [] }
        mockKV.list.mockResolvedValue(mockResult)
        
        await store.list('test:')
        
        expect(mockKV.list).toHaveBeenCalledWith({ prefix: 'test:', limit: 100 })
      })
    })

    describe('Error handling', () => {
      it('should handle get errors gracefully', async () => {
        mockKV.get.mockRejectedValue(new Error('KV get failed'))
        
        const result = await store.get('test-key')
        
        expect(result).toBeNull()
        // Should log error
        expect(logSpy).toHaveBeenCalledWith('error', 'KV get failed', expect.any(Object))
      })

      it('should handle put errors gracefully', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        mockKV.put.mockRejectedValue(new Error('KV put failed'))
        
        // Should not throw
        await expect(store.put('test-key', record)).resolves.toBeUndefined()
        
        // Should log error
        expect(logSpy).toHaveBeenCalledWith('error', 'KV put failed', expect.any(Object))
      })

      it('should handle delete errors gracefully', async () => {
        mockKV.delete.mockRejectedValue(new Error('KV delete failed'))
        
        // Should not throw
        await expect(store.delete('test-key')).resolves.toBeUndefined()
        
        // Should log error
        expect(logSpy).toHaveBeenCalledWith('error', 'KV delete failed', expect.any(Object))
      })

      it('should handle list errors gracefully', async () => {
        mockKV.list.mockRejectedValue(new Error('KV list failed'))
        
        const keys = await store.list('test:')
        
        expect(keys).toEqual([])
        // Should log error
        expect(logSpy).toHaveBeenCalledWith('error', 'KV list failed', expect.any(Object))
      })

      it('should handle non-Error objects in catch blocks', async () => {
        mockKV.get.mockRejectedValue('String error')
        
        const result = await store.get('test-key')
        
        expect(result).toBeNull()
        expect(logSpy).toHaveBeenCalledWith('error', 'KV get failed', expect.objectContaining({
          error: 'String error'
        }))
      })
    })

    describe('Logging behavior', () => {
      it('should log debug information when log level is debug', async () => {
        const debugStore = new CloudflareKVStore(mockKV, 'debug')
        mockKV.get.mockResolvedValue({ test: 'data' })
        
        await debugStore.get('test-key')
        
        expect(logSpy).toHaveBeenCalledWith('debug', 'KV get operation', expect.any(Object))
      })

      it('should not log debug information when log level is not debug', async () => {
        const infoStore = new CloudflareKVStore(mockKV, 'info')
        mockKV.get.mockResolvedValue({ test: 'data' })
        
        await infoStore.get('test-key')
        
        expect(logSpy).not.toHaveBeenCalledWith('debug', 'KV get operation', expect.any(Object))
      })

      it('should log all operations in debug mode', async () => {
        const record: RateLimitRecord = {
          timestamps: [Date.now()],
          windowMs: 5000,
          maxRequests: 10,
          lastAccess: Date.now()
        }

        mockKV.get.mockResolvedValue(record)
        mockKV.put.mockResolvedValue(undefined)
        mockKV.delete.mockResolvedValue(undefined)
        mockKV.list.mockResolvedValue({ keys: [] })

        await store.get('test-key')
        await store.put('test-key', record)
        await store.delete('test-key')
        await store.list('test:')

        expect(logSpy).toHaveBeenCalledWith('debug', 'KV get operation', expect.any(Object))
        expect(logSpy).toHaveBeenCalledWith('debug', 'KV put operation', expect.any(Object))
        expect(logSpy).toHaveBeenCalledWith('debug', 'KV delete operation', expect.any(Object))
        expect(logSpy).toHaveBeenCalledWith('debug', 'KV list operation', expect.any(Object))
      })
    })

    describe('Edge cases', () => {
      it('should handle null responses from KV', async () => {
        mockKV.get.mockResolvedValue(null)
        
        const result = await store.get('test-key')
        
        expect(result).toBeNull()
      })

      it('should handle undefined responses from KV', async () => {
        mockKV.get.mockResolvedValue(undefined)
        
        const result = await store.get('test-key')
        
        expect(result).toBeNull()
      })

      it('should handle empty list responses', async () => {
        mockKV.list.mockResolvedValue({ keys: [] })
        
        const keys = await store.list('test:')
        
        expect(keys).toEqual([])
      })

      it('should handle large list responses', async () => {
        const largeList = Array.from({ length: 1000 }, (_, i) => ({ name: `key${i}` }))
        mockKV.list.mockResolvedValue({ keys: largeList })
        
        const keys = await store.list('test:', 1000)
        
        expect(keys).toHaveLength(1000)
        expect(keys[0]).toBe('key0')
        expect(keys[999]).toBe('key999')
      })
    })
  })
})