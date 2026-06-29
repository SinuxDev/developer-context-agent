import type { LocalConfig } from '../local/config.js';

export interface Embedder {
  available: boolean;
  checkAvailability(): Promise<boolean>;
  embed(text: string): Promise<Float32Array | null>;
}

export class OllamaEmbedder implements Embedder {
  available = false;

  constructor(private readonly config: LocalConfig) {}

  async checkAvailability(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      this.available = res.ok;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (!this.available) {
      await this.checkAvailability();
    }
    if (!this.available) return null;

    try {
      const res = await fetch(`${this.config.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.ollamaEmbedModel,
          prompt: text.slice(0, 8000),
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as { embedding?: number[] };
      if (!data.embedding?.length) return null;
      return new Float32Array(data.embedding);
    } catch {
      return null;
    }
  }
}
