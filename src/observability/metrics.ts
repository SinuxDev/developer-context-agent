export interface MetricsSnapshot {
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cache: {
    prefixHits: number;
    prefixMisses: number;
    retrievalHits: number;
    retrievalMisses: number;
    summaryHits: number;
    summaryMisses: number;
  };
  runs: {
    started: number;
    completed: number;
    failed: number;
  };
  latency: {
  requestCount: number;
    totalMs: number;
    avgMs: number;
  };
  cost: {
    estimatedUsd: number;
  };
}

export class MetricsRegistry {
  private tokens = { input: 0, output: 0, total: 0 };
  private cache = {
    prefixHits: 0,
    prefixMisses: 0,
    retrievalHits: 0,
    retrievalMisses: 0,
    summaryHits: 0,
    summaryMisses: 0,
  };
  private runs = { started: 0, completed: 0, failed: 0 };
  private latency = { requestCount: 0, totalMs: 0 };
  private cost = { estimatedUsd: 0 };

  recordTokens(input: number, output: number): void {
    this.tokens.input += input;
    this.tokens.output += output;
    this.tokens.total += input + output;
  }

  recordCacheHit(layer: 'prefix' | 'retrieval' | 'summary'): void {
    if (layer === 'prefix') this.cache.prefixHits++;
    else if (layer === 'retrieval') this.cache.retrievalHits++;
    else this.cache.summaryHits++;
  }

  recordCacheMiss(layer: 'prefix' | 'retrieval' | 'summary'): void {
    if (layer === 'prefix') this.cache.prefixMisses++;
    else if (layer === 'retrieval') this.cache.retrievalMisses++;
    else this.cache.summaryMisses++;
  }

  recordRunStarted(): void {
    this.runs.started++;
  }

  recordRunCompleted(): void {
    this.runs.completed++;
  }

  recordRunFailed(): void {
    this.runs.failed++;
  }

  recordRequestLatency(ms: number): void {
    this.latency.requestCount++;
    this.latency.totalMs += ms;
  }

  recordCost(usd: number): void {
    this.cost.estimatedUsd += usd;
  }

  snapshot(): MetricsSnapshot {
    const avgMs =
      this.latency.requestCount > 0
        ? this.latency.totalMs / this.latency.requestCount
        : 0;

    return {
      tokens: { ...this.tokens },
      cache: { ...this.cache },
      runs: { ...this.runs },
      latency: {
        requestCount: this.latency.requestCount,
        totalMs: this.latency.totalMs,
        avgMs,
      },
      cost: { ...this.cost },
    };
  }

  reset(): void {
    this.tokens = { input: 0, output: 0, total: 0 };
    this.cache = {
      prefixHits: 0,
      prefixMisses: 0,
      retrievalHits: 0,
      retrievalMisses: 0,
      summaryHits: 0,
      summaryMisses: 0,
    };
    this.runs = { started: 0, completed: 0, failed: 0 };
    this.latency = { requestCount: 0, totalMs: 0 };
    this.cost = { estimatedUsd: 0 };
  }
}

export const metrics = new MetricsRegistry();
