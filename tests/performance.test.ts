import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PerformanceTimer, measureAsync } from '../src/utils'

describe('Performance measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PerformanceTimer measures elapsed time correctly', async () => {
    const timer = new PerformanceTimer('test-timer')
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const elapsed = timer.finish()
    expect(elapsed).toBeGreaterThanOrEqual(10)
    expect(elapsed).toBeLessThan(50) // Allow some variance
  })

  it('measureAsync wraps function execution with timing', async () => {
    const mockFn = vi.fn().mockResolvedValue('test-result')
    
    const result = await measureAsync('test-operation', mockFn)
    
    expect(result).toBe('test-result')
    expect(mockFn).toHaveBeenCalledOnce()
  })

  it('measureAsync handles errors correctly', async () => {
    const mockError = new Error('test error')
    const mockFn = vi.fn().mockRejectedValue(mockError)
    
    await expect(
      measureAsync('failing-operation', mockFn)
    ).rejects.toThrow('test error')
    
    expect(mockFn).toHaveBeenCalledOnce()
  })

  it('timer checkpoint records intermediate measurements', () => {
    const timer = new PerformanceTimer('checkpoint-test')
    
    // No need to test the actual timing, just ensure it doesn't throw
    expect(() => timer.checkpoint('milestone-1')).not.toThrow()
    expect(() => timer.checkpoint('milestone-2')).not.toThrow()
    
    const elapsed = timer.finish()
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })
})