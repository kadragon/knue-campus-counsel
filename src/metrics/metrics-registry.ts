import { InMemoryMetrics } from './metrics.js'
import type { Metrics } from './metrics.js'

let singleton: Metrics | null = null

export function getMetrics(): Metrics {
  if (!singleton) singleton = new InMemoryMetrics()
  return singleton
}

export function setMetrics(m: Metrics): void {
  singleton = m
}

