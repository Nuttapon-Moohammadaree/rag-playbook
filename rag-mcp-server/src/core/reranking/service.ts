/**
 * Reranking service - cross-encoder reranking via LiteLLM
 */

import { config } from '../../config/index.js';
import type { RerankRequest, RerankResult } from '../../types/index.js';

export class RerankingService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
    this.model = config.reranking.model;
  }

  /**
   * Rerank documents based on query relevance using cross-encoder model
   */
  async rerank(request: RerankRequest): Promise<RerankResult[]> {
    const { query, documents, topN = config.reranking.topN } = request;

    if (documents.length === 0) {
      return [];
    }

    // If documents <= topN, no need to rerank
    if (documents.length <= topN) {
      return documents.map((_, index) => ({
        index,
        relevanceScore: 1.0, // Placeholder score
      }));
    }

    try {
      // Use LiteLLM rerank API endpoint
      const response = await fetch(`${this.baseUrl}/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents,
          top_n: topN,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Rerank API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as RerankResponse;

      // Map response to RerankResult format
      return data.results.map(r => ({
        index: r.index,
        relevanceScore: r.relevance_score,
      }));
    } catch (error) {
      // On error, return original order with placeholder scores
      console.error('Reranking failed, using original order:', error);
      return documents.slice(0, topN).map((_, index) => ({
        index,
        relevanceScore: 1.0 - (index * 0.01), // Decreasing scores
      }));
    }
  }

  /**
   * Check if reranking is enabled
   */
  isEnabled(): boolean {
    return config.reranking.enabled;
  }

  /**
   * Get candidate multiplier for initial retrieval
   */
  getCandidateMultiplier(): number {
    return config.reranking.candidateMultiplier;
  }
}

// API response types
interface RerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
    document?: string;
  }>;
  model: string;
  usage?: {
    total_tokens: number;
  };
}

// Singleton instance
let rerankingService: RerankingService | null = null;

export function getRerankingService(): RerankingService {
  if (!rerankingService) {
    rerankingService = new RerankingService();
  }
  return rerankingService;
}
