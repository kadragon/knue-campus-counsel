import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceTimer, measureAsync } from '../src/utils'

describe('Performance measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('PerformanceTimer measures elapsed time correctly', () => {
    const startTime = 1000000000000
    vi.setSystemTime(startTime)
    
    const timer = new PerformanceTimer('test-timer')
    
    // Advance time by 15ms
    vi.setSystemTime(startTime + 15)
    
    const elapsed = timer.finish()
    expect(elapsed).toBe(15)
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
    const baseTime = 2000000000000
    vi.setSystemTime(baseTime)
    
    const timer = new PerformanceTimer('checkpoint-test')
    
    // Advance time for checkpoint 1
    vi.setSystemTime(baseTime + 5)
    expect(() => timer.checkpoint('milestone-1')).not.toThrow()
    
    // Advance time for checkpoint 2
    vi.setSystemTime(baseTime + 12)
    expect(() => timer.checkpoint('milestone-2')).not.toThrow()
    
    // Advance time for finish
    vi.setSystemTime(baseTime + 20)
    const elapsed = timer.finish()
    expect(elapsed).toBe(20)
  })
})