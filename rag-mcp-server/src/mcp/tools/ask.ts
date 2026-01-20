/**
 * MCP ask tool - RAG + LLM question answering
 */

import { z } from 'zod';
import { getAskService } from '../../core/ask/service.js';
import type { ToolResult } from '../../types/index.js';

// Tool schema
export const askSchema = z.object({
  question: z.string().describe('The question to answer based on indexed documents'),
  limit: z.number().min(1).max(20).optional().describe('Maximum number of context chunks to use (default: 5)'),
  threshold: z.number().min(0).max(1).optional().describe('Minimum similarity score for context (default: 0.5)'),
  model: z.string().optional().describe('LLM model to use (default: gpt-oss-120b)'),
});

export interface AskResultData {
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

// Tool implementation
export async function ask(
  params: z.infer<typeof askSchema>
): Promise<ToolResult<AskResultData>> {
  try {
    const askService = getAskService();

    const result = await askService.ask({
      question: params.question,
      limit: params.limit,
      threshold: params.threshold,
      model: params.model,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
