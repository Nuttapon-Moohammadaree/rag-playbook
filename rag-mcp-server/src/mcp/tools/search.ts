/**
 * MCP search tool
 */

import { z } from 'zod';
import { getRetrievalService } from '../../core/retrieval/service.js';
import type { ToolResult, SearchResult } from '../../types/index.js';

// Tool schema
export const searchSchema = z.object({
  query: z.string().describe('Search query text'),
  limit: z.number().min(1).max(50).optional().describe('Maximum number of results (default: 10)'),
  threshold: z.number().min(0).max(1).optional().describe('Minimum similarity score (default: 0.5)'),
  documentIds: z.array(z.string()).optional().describe('Filter by specific document IDs'),
  fileTypes: z.array(z.enum(['txt', 'md', 'docx', 'pdf', 'pptx', 'xlsx', 'csv', 'html', 'json', 'rtf'])).optional().describe('Filter by file types'),
  rerank: z.boolean().optional().describe('Enable reranking with cross-encoder (default: true)'),
  expand: z.boolean().optional().describe('Enable query expansion with LLM (default: true)'),
  hyde: z.boolean().optional().describe('Enable HyDE (Hypothetical Document Embedding) for complex queries (default: auto-detect)'),
});

// Tool implementation
export async function search(
  params: z.infer<typeof searchSchema>
): Promise<ToolResult<{ results: SearchResultItem[]; total: number }>> {
  try {
    const retrievalService = getRetrievalService();

    const results = await retrievalService.search({
      query: params.query,
      limit: params.limit,
      threshold: params.threshold,
      filters: {
        documentIds: params.documentIds,
        fileTypes: params.fileTypes,
      },
      rerank: params.rerank,
      expand: params.expand,
      hyde: params.hyde,
    });

    const items: SearchResultItem[] = results.map(r => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      filename: r.document.filename,
      filepath: r.document.filepath,
      fileType: r.document.fileType,
      content: r.content,
      // Normalize score to [0,1] range and round to 3 decimal places
      score: Math.round(Math.max(0, Math.min(1, r.score)) * 1000) / 1000,
      metadata: r.metadata,
    }));

    return {
      success: true,
      data: {
        results: items,
        total: items.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Types
interface SearchResultItem {
  chunkId: string;
  documentId: string;
  filename: string;
  filepath: string;
  fileType: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}
