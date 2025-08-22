export type KvOp = 'get' | 'put' | 'delete' | 'list'

export interface MetricsSnapshot {
  allow: number
  deny: number
  l1Hits: number
  kvErrors: { get: number; put: number; delete: number; list: number }
}

export interface Metrics {
  incAllow(): void
  incDeny(): void
  incL1Hit(): void
  incKvError(op: KvOp): void
  snapshot(): MetricsSnapshot
}

export class InMemoryMetrics implements Metrics {
  private counters = new Map<string, number>()

  private inc(key: string): void {
    const v = this.counters.get(key) ?? 0
    this.counters.set(key, v + 1)
  }

  incAllow(): void { this.inc('allow') }
  incDeny(): void { this.inc('deny') }
  incL1Hit(): void { this.inc('l1Hits') }
  incKvError(op: KvOp): void { this.inc(`kvErrors.${op}`) }

  snapshot(): MetricsSnapshot {
    // Provide a stable-object snapshot for tests and logging
    const get = (k: string) => this.counters.get(k) ?? 0
    return {
      allow: get('allow'),
      deny: get('deny'),
      l1Hits: get('l1Hits'),
      kvErrors: {
        get: get('kvErrors.get'),
        put: get('kvErrors.put'),
        delete: get('kvErrors.delete'),
        list: get('kvErrors.list'),
      },
    }
  }
}

