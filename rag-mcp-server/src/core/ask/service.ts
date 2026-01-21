/**
 * Ask service - RAG + LLM for question answering
 */

import { config } from '../../config/index.js';
import { getRetrievalService } from '../retrieval/service.js';
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
    score: number;
  }>;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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

    // Retrieve relevant context with optional reranking
    const searchResults = await this.retrievalService.search({
      query: question,
      limit,
      threshold,
      rerank,
    });

    if (searchResults.length === 0) {
      // Detect if query contains Thai characters for bilingual response
      const hasThai = /[\u0E00-\u0E7F]/.test(question);
      const noResultsMessage = hasThai
        ? 'ไม่พบข้อมูลที่เกี่ยวข้องในฐานข้อมูล กรุณาลองถามคำถามอื่น หรือตรวจสอบว่าได้ index เอกสารที่เกี่ยวข้องแล้ว'
        : 'No relevant information found in the database. Please try a different question or ensure the relevant documents have been indexed.';
      return {
        answer: noResultsMessage,
        sources: [],
        model,
      };
    }

    // Build context from search results
    const context = this.buildContext(searchResults);

    // Generate answer using LLM
    const llmResponse = await this.generateAnswer(question, context, model);

    return {
      answer: llmResponse.answer,
      sources: searchResults.map(r => ({
        filename: r.document.filename,
        filepath: r.document.filepath,
        content: (r.content?.substring(0, 200) ?? '') + '...',
        score: Math.round(r.score * 1000) / 1000,
      })),
      model,
      usage: llmResponse.usage,
    };
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
  ): Promise<{ answer: string; usage?: AskResponse['usage'] }> {
    const userPrompt = `Context:
${context}

Question: ${question}

Please answer the question based on the context above.`;

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
  }
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
