/**
 * RelevanceFilter - LLM-based chunk relevance scoring
 *
 * Uses LLM to score each chunk's relevance to the question,
 * filtering out chunks that don't meet the threshold.
 */

import { config } from '../../config/index.js';
import type { SearchResult } from '../../types/index.js';
import type {
  VerificationConfig,
  RelevanceFilterResult,
  ScoredChunk,
  LLMRelevanceResponse,
} from './types.js';

const RELEVANCE_SYSTEM_PROMPT = `You are a relevance scoring assistant. Your job is to evaluate how relevant a text chunk is to answering a user's question.

Score the relevance from 0.0 to 1.0 where:
- 0.0-0.3: Not relevant - the chunk doesn't contain information useful for answering the question
- 0.4-0.6: Partially relevant - the chunk contains some related information but may not directly answer the question
- 0.7-0.9: Relevant - the chunk contains information that helps answer the question
- 1.0: Highly relevant - the chunk directly answers the question

Respond ONLY with valid JSON in this exact format:
{"score": 0.8, "explanation": "Brief explanation of the relevance score"}`;

export class RelevanceFilter {
  private apiKey: string;
  private baseUrl: string;
  private config: VerificationConfig;
  private cache: Map<string, { score: number; explanation: string; timestamp: number }> = new Map();

  constructor(verificationConfig: VerificationConfig) {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
    this.config = verificationConfig;
  }

  /**
   * Filter chunks by LLM-assessed relevance
   */
  async filterByRelevance(
    question: string,
    searchResults: SearchResult[]
  ): Promise<RelevanceFilterResult> {
    const startTime = Date.now();

    // Score all chunks in parallel (with concurrency limit)
    const scoredChunks = await this.scoreChunksParallel(question, searchResults);

    // Filter by threshold
    const relevantChunks = scoredChunks.filter(
      (chunk) => chunk.relevanceScore >= this.config.relevanceThreshold
    );

    // Sort by relevance score descending
    relevantChunks.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      relevantChunks,
      filteredCount: searchResults.length - relevantChunks.length,
      filterTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Score multiple chunks in parallel with concurrency limit
   */
  private async scoreChunksParallel(
    question: string,
    searchResults: SearchResult[]
  ): Promise<ScoredChunk[]> {
    const results: ScoredChunk[] = [];
    const maxParallel = this.config.maxParallelCalls;

    // Process in batches
    for (let i = 0; i < searchResults.length; i += maxParallel) {
      const batch = searchResults.slice(i, i + maxParallel);
      const batchResults = await Promise.all(
        batch.map((result) => this.scoreChunk(question, result))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Score a single chunk's relevance
   */
  private async scoreChunk(
    question: string,
    searchResult: SearchResult
  ): Promise<ScoredChunk> {
    // Check cache first
    const cacheKey = this.getCacheKey(question, searchResult.chunkId);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        searchResult,
        relevanceScore: cached.score,
        explanation: cached.explanation,
      };
    }

    try {
      const response = await this.callLLM(question, searchResult);

      // Cache the result
      if (this.config.cacheResults) {
        this.setCache(cacheKey, response.score, response.explanation);
      }

      return {
        searchResult,
        relevanceScore: response.score,
        explanation: response.explanation,
      };
    } catch (error) {
      // On error, use original score as fallback
      console.error('Relevance scoring failed, using original score:', error);
      return {
        searchResult,
        relevanceScore: searchResult.score,
        explanation: 'Fallback to vector similarity score',
      };
    }
  }

  /**
   * Call LLM to score relevance
   */
  private async callLLM(
    question: string,
    searchResult: SearchResult
  ): Promise<LLMRelevanceResponse> {
    const userPrompt = `Question: ${question}

Document: ${searchResult.document.filename}

Text chunk:
${searchResult.content}

Rate the relevance of this text chunk to answering the question. Respond with JSON only.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.litellm.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: config.llm.model,
          messages: [
            { role: 'system', content: RELEVANCE_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 200,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      const content = data.choices[0]?.message?.content ?? '';
      return this.parseRelevanceResponse(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse LLM response to relevance score
   */
  private parseRelevanceResponse(content: string): LLMRelevanceResponse {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      // Validate score
      const score = typeof parsed.score === 'number'
        ? Math.max(0, Math.min(1, parsed.score))
        : 0.5;

      const explanation = typeof parsed.explanation === 'string'
        ? parsed.explanation
        : 'No explanation provided';

      return { score, explanation };
    } catch {
      // Fallback: try to extract numeric score from text
      const scoreMatch = content.match(/(\d+\.?\d*)/);
      const score = scoreMatch ? Math.min(1, parseFloat(scoreMatch[1])) : 0.5;
      return {
        score,
        explanation: 'Failed to parse JSON response',
      };
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(question: string, chunkId: string): string {
    return `${question.substring(0, 100)}:${chunkId}`;
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(key: string): { score: number; explanation: string } | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return { score: cached.score, explanation: cached.explanation };
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, score: number, explanation: string): void {
    // Limit cache size
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      score,
      explanation,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
