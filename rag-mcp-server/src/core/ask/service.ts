/**
 * Ask service - RAG + LLM for question answering
 */

import { config } from '../../config/index.js';
import { getRetrievalService, type SearchMetadata } from '../retrieval/service.js';
import type { SearchResult } from '../../types/index.js';

export interface AskRequest {
  question: string;
  limit?: number;
  threshold?: number;
  model?: string;
  rerank?: boolean;
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
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
  }

  /**
   * Answer a question using RAG
   */
  async ask(request: AskRequest): Promise<AskResponse> {
    const {
      question,
      limit = DEFAULT_LIMIT,
      threshold = DEFAULT_THRESHOLD,
      model = DEFAULT_MODEL,
      rerank,
    } = request;

    // Retrieve relevant context with optional reranking (includes metadata)
    const { results: searchResults, metadata } = await this.retrievalService.searchWithMetadata({
      query: question,
      limit,
      threshold,
      rerank,
    });

    if (searchResults.length === 0) {
      // Detect if query or context is likely Thai for bilingual response
      const hasThai = /[\u0E00-\u0E7F]/.test(question);
      // Also check for common Thai question words even without Thai script
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

    // Deduplicate sources by filepath, keeping highest score per file
    const dedupedResults = this.deduplicateSources(searchResults);

    // Build context from search results
    const context = this.buildContext(dedupedResults);

    // Generate answer using LLM
    const llmResponse = await this.generateAnswer(question, context, model);

    return {
      answer: llmResponse.answer,
      sources: dedupedResults.map(r => ({
        filename: r.document.filename,
        filepath: r.document.filepath,
        content: (r.content?.substring(0, 200) ?? '') + '...',
        // Normalize score to [0,1] range and round to 3 decimal places for display
        score: Math.round(Math.max(0, Math.min(1, r.score)) * 1000) / 1000,
        // Preserve original score for debugging/analysis
        originalScore: r.score,
      })),
      model,
      usage: llmResponse.usage ? {
        llm: llmResponse.usage,
      } : undefined,
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

    // Sort by score descending
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

    // Create AbortController for timeout
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

      // Validate LLM response structure
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
