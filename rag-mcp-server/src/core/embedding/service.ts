/**
 * Embedding service using LiteLLM API with BGE-M3
 */

import { config } from '../../config/index.js';
import { withRetry } from '../../utils/security.js';
import type { EmbeddingResponse } from '../../types/index.js';

const BATCH_SIZE = 32; // Process embeddings in batches

export class EmbeddingService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor() {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
    this.model = config.litellm.embeddingModel;
    this.timeout = config.litellm.timeout;
  }

  /**
   * Generate embeddings for a list of texts
   */
  async embed(texts: string[]): Promise<EmbeddingResponse> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.model,
        usage: { promptTokens: 0, totalTokens: 0 },
      };
    }

    // Process in batches if needed
    if (texts.length > BATCH_SIZE) {
      return this.embedBatched(texts);
    }

    return this.embedBatch(texts);
  }

  /**
   * Generate embedding for a single text
   */
  async embedSingle(text: string): Promise<number[]> {
    const response = await this.embed([text]);
    if (!response.embeddings || response.embeddings.length === 0) {
      throw new Error('Embedding API returned empty embeddings array');
    }
    return response.embeddings[0];
  }

  /**
   * Process texts in batches (parallel processing)
   */
  private async embedBatched(texts: string[]): Promise<EmbeddingResponse> {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      batches.push(texts.slice(i, i + BATCH_SIZE));
    }

    // Process all batches in parallel for better performance
    const results = await Promise.all(
      batches.map(batch => this.embedBatch(batch))
    );

    // Combine results in order
    const allEmbeddings = results.flatMap(r => r.embeddings);
    const totalUsage = results.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.usage.promptTokens,
        totalTokens: acc.totalTokens + r.usage.totalTokens,
      }),
      { promptTokens: 0, totalTokens: 0 }
    );

    return {
      embeddings: allEmbeddings,
      model: this.model,
      usage: totalUsage,
    };
  }

  /**
   * Generate embeddings for a single batch with retry logic
   */
  private async embedBatch(texts: string[]): Promise<EmbeddingResponse> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: this.model,
              input: texts,
              encoding_format: 'float',
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Embedding API error (${response.status}): ${errorText}`);
          }

          const data = await response.json() as LiteLLMEmbeddingResponse;

          // Sort by index to ensure correct order
          const sortedData = data.data.sort((a, b) => a.index - b.index);
          const embeddings = sortedData.map(item => item.embedding);

          return {
            embeddings,
            model: data.model,
            usage: {
              promptTokens: data.usage?.prompt_tokens ?? 0,
              totalTokens: data.usage?.total_tokens ?? 0,
            },
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        onRetry: (attempt, error, delayMs) => {
          console.warn(`Embedding API retry ${attempt}/3 after ${delayMs}ms: ${error.message}`);
        },
      }
    );
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // BGE-M3 uses a tokenizer similar to BERT
    // Rough estimate: ~4 characters per token for English
    // Adjust for multilingual content
    return Math.ceil(text.length / 4);
  }
}

// LiteLLM API response types
interface LiteLLMEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  object: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
