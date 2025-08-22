import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LRUCache } from '../../src/rate-limit/memory-cache.js'

describe('LRUCache', () => {
  let cache: LRUCache<string>

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new LRUCache<string>(3, 1000) // 3 items max, 1 second TTL
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
    })

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull()
    })

    it('should return correct size', () => {
      expect(cache.size()).toBe(0)
      cache.set('key1', 'value1')
      expect(cache.size()).toBe(1)
      cache.set('key2', 'value2')
      expect(cache.size()).toBe(2)
    })

    it('should check if key exists', () => {
      expect(cache.has('key1')).toBe(false)
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)
    })

    it('should delete keys', () => {
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)
      expect(cache.delete('key1')).toBe(true)
      expect(cache.has('key1')).toBe(false)
      expect(cache.delete('nonexistent')).toBe(false)
    })

    it('should clear all entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      expect(cache.size()).toBe(2)
      cache.clear()
      expect(cache.size()).toBe(0)
      expect(cache.get('key1')).toBeNull()
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used item when capacity is exceeded', () => {
      // Fill cache to capacity
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      expect(cache.size()).toBe(3)

      // Add one more item, should evict key1 (oldest)
      cache.set('key4', 'value4')
      expect(cache.size()).toBe(3)
      expect(cache.get('key1')).toBeNull() // Should be evicted
      expect(cache.get('key2')).toBe('value2')
      expect(cache.get('key3')).toBe('value3')
      expect(cache.get('key4')).toBe('value4')
    })

    it('should update access order when getting items', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      // Access key1 to make it most recently used
      cache.get('key1')

      // Add new item, should evict key2 (now oldest)
      cache.set('key4', 'value4')
      expect(cache.get('key1')).toBe('value1') // Should still exist
      expect(cache.get('key2')).toBeNull() // Should be evicted
      expect(cache.get('key3')).toBe('value3')
      expect(cache.get('key4')).toBe('value4')
    })

    it('should update access order when setting existing keys', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      // Update key1 to make it most recently used
      cache.set('key1', 'new_value1')

      // Add new item, should evict key2 (now oldest)
      cache.set('key4', 'value4')
      expect(cache.get('key1')).toBe('new_value1') // Should still exist with new value
      expect(cache.get('key2')).toBeNull() // Should be evicted
      expect(cache.get('key3')).toBe('value3')
      expect(cache.get('key4')).toBe('value4')
    })
  })

  describe('TTL functionality', () => {
    it('should expire items after TTL', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')

      // Advance time past TTL
      vi.advanceTimersByTime(1500)
      expect(cache.get('key1')).toBeNull()
    })

    it('should not expire items before TTL', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')

      // Advance time but not past TTL
      vi.advanceTimersByTime(500)
      expect(cache.get('key1')).toBe('value1')
    })

    it('should clean up expired items automatically on get', () => {
      cache.set('key1', 'value1')
      expect(cache.size()).toBe(1)

      // Advance time past TTL
      vi.advanceTimersByTime(1500)
      
      // Access should trigger cleanup
      expect(cache.get('key1')).toBeNull()
      expect(cache.size()).toBe(0)
    })

    it('should handle mixed expired and non-expired items', () => {
      cache.set('key1', 'value1')
      
      // Advance time halfway
      vi.advanceTimersByTime(500)
      cache.set('key2', 'value2')
      
      // Advance time to expire only key1
      vi.advanceTimersByTime(600)
      
      expect(cache.get('key1')).toBeNull() // Expired
      expect(cache.get('key2')).toBe('value2') // Still valid
    })
  })

  describe('Cleanup functionality', () => {
    it('should clean up expired entries manually', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      
      // Advance time past TTL
      vi.advanceTimersByTime(1500)
      
      const cleaned = cache.cleanup()
      expect(cleaned).toBe(2)
      expect(cache.size()).toBe(0)
    })

    it('should not clean up non-expired entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      
      // Advance time but not past TTL
      vi.advanceTimersByTime(500)
      
      const cleaned = cache.cleanup()
      expect(cleaned).toBe(0)
      expect(cache.size()).toBe(2)
    })

    it('should clean up only expired entries in mixed scenario', () => {
      cache.set('key1', 'value1')
      
      // Advance time halfway
      vi.advanceTimersByTime(500)
      cache.set('key2', 'value2')
      
      // Advance time to expire only key1
      vi.advanceTimersByTime(600)
      
      const cleaned = cache.cleanup()
      expect(cleaned).toBe(1)
      expect(cache.size()).toBe(1)
      expect(cache.get('key2')).toBe('value2')
    })
  })

  describe('Statistics', () => {
    it('should provide accurate stats', () => {
      const stats = cache.getStats()
      expect(stats.size).toBe(0)
      expect(stats.maxSize).toBe(3)
      expect(stats.utilization).toBe(0)
      expect(stats.ttl).toBe(1000)
    })

    it('should update stats as cache fills', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      
      const stats = cache.getStats()
      expect(stats.size).toBe(2)
      expect(stats.utilization).toBe(67) // 2/3 * 100, rounded
    })

    it('should show 100% utilization when full', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      
      const stats = cache.getStats()
      expect(stats.size).toBe(3)
      expect(stats.utilization).toBe(100)
    })
  })

  describe('Edge cases', () => {
    it('should handle zero capacity', () => {
      const zeroCache = new LRUCache<string>(0, 1000)
      zeroCache.set('key1', 'value1')
      expect(zeroCache.get('key1')).toBeNull()
      expect(zeroCache.size()).toBe(0)
    })

    it('should handle very short TTL', () => {
      const shortTtlCache = new LRUCache<string>(3, 1) // 1ms TTL
      shortTtlCache.set('key1', 'value1')
      
      vi.advanceTimersByTime(2)
      expect(shortTtlCache.get('key1')).toBeNull()
    })

    it('should handle undefined values', () => {
      const undefinedCache = new LRUCache<string | undefined>(3, 1000)
      undefinedCache.set('key1', undefined)
      expect(undefinedCache.get('key1')).toBeUndefined()
      expect(undefinedCache.has('key1')).toBe(true)
    })

    it('should handle object values', () => {
      const objectCache = new LRUCache<{id: number, name: string}>(3, 1000)
      const obj = { id: 1, name: 'test' }
      objectCache.set('key1', obj)
      expect(objectCache.get('key1')).toEqual(obj)
      expect(objectCache.get('key1')).toBe(obj) // Same reference
    })
  })

  describe('Performance characteristics', () => {
    it('should handle large number of operations efficiently', () => {
      const largeCache = new LRUCache<number>(1000, 10000)
      
      // Add many items
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, i)
      }
      
      expect(largeCache.size()).toBe(1000)
      
      // Access items (should be fast)
      for (let i = 0; i < 1000; i++) {
        expect(largeCache.get(`key${i}`)).toBe(i)
      }
      
      // Add more items to trigger eviction
      for (let i = 1000; i < 1500; i++) {
        largeCache.set(`key${i}`, i)
      }
      
      expect(largeCache.size()).toBe(1000) // Should maintain max size
    })

    it('should maintain O(1) operations under normal load', () => {
      const perfCache = new LRUCache<string>(100, 5000)
      
      // Warm up
      for (let i = 0; i < 50; i++) {
        perfCache.set(`key${i}`, `value${i}`)
      }
      
      // Measure operation time (should be very fast)
      const start = Date.now()
      for (let i = 0; i < 1000; i++) {
        perfCache.set(`perf${i % 100}`, `value${i}`)
        perfCache.get(`perf${i % 100}`)
      }
      const end = Date.now()
      
      // Should complete 2000 operations in reasonable time
      expect(end - start).toBeLessThan(100) // Less than 100ms for 2000 operations
    })
  })
})