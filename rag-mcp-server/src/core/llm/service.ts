/**
 * Base LLM service for AI-enhanced features
 */

import { config } from '../../config/index.js';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface OpenAIResponse {
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

const DEFAULT_MODEL = 'gpt-oss-120b';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1000;

export class LLMService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
  }

  /**
   * Generate completion using LLM
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const {
      prompt,
      systemPrompt,
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
      maxTokens = DEFAULT_MAX_TOKENS,
    } = request;

    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.litellm.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Log full error server-side for debugging
        console.error('LLM API error details:', errorText);
        // Return sanitized error message to caller
        throw new Error(`LLM API error (${response.status}): Request failed`);
      }

      const data = await response.json() as OpenAIResponse;
      const content = data.choices[0]?.message?.content ?? '';

      return {
        content,
        model: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM API timeout: Request exceeded ${config.litellm.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Singleton instance
let llmService: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmService) {
    llmService = new LLMService();
  }
  return llmService;
}
