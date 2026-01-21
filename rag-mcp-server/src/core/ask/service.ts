/**
 * Ask service - RAG + LLM for question answering with optional verification
 */

import { config } from '../../config/index.js';
import { getRetrievalService, type SearchMetadata } from '../retrieval/service.js';
import {
  getVerificationService,
  type VerificationResult,
  type Citation,
  type ScoredChunk,
} from '../verification/index.js';
import type { SearchResult } from '../../types/index.js';

export interface AskRequest {
  question: string;
  limit?: number;
  threshold?: number;
  model?: string;
  rerank?: boolean;
  /** Enable LLM verification pipeline */
  verify?: boolean;
}

export interface AskResponse {
  answer: string;
  sources: Array<{
    filename: string;
    filepath: string;
    content: string;
    score: number;           // Normalized score [0,1]
    originalScore: number;   // Original raw score from retrieval/reranking
  }>;
  model: string;
  usage?: {
    llm: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    embedding?: {
      totalTokens: number;
    };
    reranking?: {
      totalTokens: number;
    };
  };
  metadata?: SearchMetadata;
  /** Verification result (only present if verify=true) */
  verification?: VerificationResult;
  /** Confidence score based on verification (0-1) */
  confidence?: number;
}

const DEFAULT_MODEL = 'gpt-oss-120b';
const DEFAULT_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.5;

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context.

Guidelines:
- Answer based ONLY on the information in the provided context
- If the context doesn't contain enough information to answer, say so clearly
- Be concise but thorough
- If the context is in Thai, respond in Thai
- Cite specific documents when relevant
- Format your response clearly with markdown if helpful`;

export class AskService {
  private retrievalService = getRetrievalService();
  private verificationService = getVerificationService();
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
  }

  /**
   * Answer a question using RAG with optional verification
   */
  async ask(request: AskRequest): Promise<AskResponse> {
    const {
      question,
      limit = DEFAULT_LIMIT,
      threshold = DEFAULT_THRESHOLD,
      model = DEFAULT_MODEL,
      rerank,
      verify = false,
    } = request;

    // Retrieve relevant context with optional reranking (includes metadata)
    const { results: searchResults, metadata } = await this.retrievalService.searchWithMetadata({
      query: question,
      limit,
      threshold,
      rerank,
    });

    if (searchResults.length === 0) {
      return this.buildNoResultsResponse(question, model, metadata);
    }

    // If verification is enabled, filter chunks by relevance first
    let resultsToUse = searchResults;
    let chunksFiltered = 0;
    let scoredChunks: ScoredChunk[] | null = null;

    if (verify && config.verification.enabled) {
      const filterResult = await this.verificationService.filterByRelevance(
        question,
        searchResults
      );
      chunksFiltered = filterResult.filteredCount;
      scoredChunks = filterResult.relevantChunks;

      // Use filtered results for answer generation
      resultsToUse = filterResult.relevantChunks.map(c => c.searchResult);

      // If all chunks were filtered out, return no results
      if (resultsToUse.length === 0) {
        return this.buildNoResultsResponse(question, model, metadata);
      }
    }

    // Deduplicate sources by filepath, keeping highest score per file
    const dedupedResults = this.deduplicateSources(resultsToUse);

    // Build context from search results
    const context = this.buildContext(dedupedResults);

    // Generate answer using LLM
    const llmResponse = await this.generateAnswer(question, context, model);

    // Build base response
    const response: AskResponse = {
      answer: llmResponse.answer,
      sources: dedupedResults.map(r => ({
        filename: r.document.filename,
        filepath: r.document.filepath,
        content: (r.content?.substring(0, 200) ?? '') + '...',
        score: Math.round(Math.max(0, Math.min(1, r.score)) * 1000) / 1000,
        originalScore: r.score,
      })),
      model,
      usage: llmResponse.usage ? {
        llm: llmResponse.usage,
      } : undefined,
      metadata,
    };

    // Run verification if enabled
    if (verify && config.verification.enabled) {
      const verification = await this.runVerification(
        question,
        llmResponse.answer,
        scoredChunks || dedupedResults.map(r => ({ searchResult: r, relevanceScore: r.score })),
        chunksFiltered
      );

      response.verification = verification;
      response.confidence = this.calculateConfidence(verification);
    }

    return response;
  }

  /**
   * Run verification pipeline on the answer
   */
  private async runVerification(
    question: string,
    answer: string,
    chunks: ScoredChunk[],
    chunksFiltered: number
  ): Promise<VerificationResult> {
    const groundingResult = await this.verificationService.verifyGrounding(
      question,
      answer,
      chunks
    );

    return {
      enabled: true,
      groundingScore: groundingResult.groundingScore,
      isGrounded: groundingResult.isGrounded,
      unsupportedClaims: groundingResult.unsupportedClaims,
      citations: groundingResult.citations,
      chunksFiltered,
      verificationTimeMs: groundingResult.verificationTimeMs,
    };
  }

  /**
   * Calculate confidence score from verification result
   */
  private calculateConfidence(verification: VerificationResult): number {
    // Base confidence from grounding score
    let confidence = verification.groundingScore;

    // Penalize for unsupported claims
    if (verification.unsupportedClaims.length > 0) {
      const penalty = Math.min(0.3, verification.unsupportedClaims.length * 0.1);
      confidence -= penalty;
    }

    // Ensure confidence is in valid range
    return Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
  }

  /**
   * Build response for no results case
   */
  private buildNoResultsResponse(
    question: string,
    model: string,
    metadata?: SearchMetadata
  ): AskResponse {
    const hasThai = /[\u0E00-\u0E7F]/.test(question);
    const hasThaiPatterns = /\b(ยังไง|อะไร|ทำไม|ที่ไหน|เมื่อไร|ใคร)\b/.test(question);

    const respondInThai = hasThai || hasThaiPatterns;
    const noResultsMessage = respondInThai
      ? 'ไม่พบข้อมูลที่เกี่ยวข้องในฐานข้อมูล กรุณาลองถามคำถามอื่น หรือตรวจสอบว่าได้ index เอกสารที่เกี่ยวข้องแล้ว'
      : 'No relevant information found in the database. Please try a different question or ensure the relevant documents have been indexed.';

    return {
      answer: noResultsMessage,
      sources: [],
      model,
      metadata,
    };
  }

  /**
   * Deduplicate search results by filepath, keeping highest score per file
   */
  private deduplicateSources(results: SearchResult[]): SearchResult[] {
    const dedupedMap = new Map<string, SearchResult>();

    for (const result of results) {
      const filepath = result.document.filepath;
      const existing = dedupedMap.get(filepath);
      if (!existing || result.score > existing.score) {
        dedupedMap.set(filepath, result);
      }
    }

    return Array.from(dedupedMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Build context string from search results
   */
  private buildContext(results: SearchResult[]): string {
    const contextParts = results.map((r, i) => {
      return `[Document ${i + 1}: ${r.document.filename}]
${r.content}`;
    });

    return contextParts.join('\n\n---\n\n');
  }

  /**
   * Generate answer using LLM
   */
  private async generateAnswer(
    question: string,
    context: string,
    model: string
  ): Promise<{ answer: string; usage?: LLMUsage }> {
    const userPrompt = `Context:
${context}

Question: ${question}

Please answer the question based on the context above.`;

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
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as LLMResponse;

      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('LLM API returned invalid response: missing or empty choices array');
      }

      const firstChoice = data.choices[0];
      if (!firstChoice?.message?.content) {
        throw new Error('LLM API returned invalid response: missing message content');
      }

      const answer = firstChoice.message.content;

      return {
        answer,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM API request timed out after ${config.litellm.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

// Singleton instance
let askService: AskService | null = null;

export function getAskService(): AskService {
  if (!askService) {
    askService = new AskService();
  }
  return askService;
}

// Re-export verification types for convenience
export type { VerificationResult, Citation };
