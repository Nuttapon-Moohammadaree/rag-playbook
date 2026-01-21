/**
 * MCP tools for LLM-enhanced features
 */

import { z } from 'zod';
import { getSummarizer, type SummaryStyle } from '../../core/llm/summarizer.js';
import { getDocumentById, getChunksByDocumentId } from '../../storage/sqlite.js';
import type { ToolResult } from '../../types/index.js';

// Tool schemas
export const summarizeDocumentSchema = z.object({
  documentId: z.string().describe('ID of the document to summarize'),
  style: z.enum(['brief', 'detailed', 'bullet_points']).optional()
    .describe('Summary style: brief (2-3 sentences), detailed (comprehensive), or bullet_points (list format). Default: brief'),
});

// Tool implementations
export async function summarizeDocument(
  params: z.infer<typeof summarizeDocumentSchema>
): Promise<ToolResult<{ summary: string; documentId: string; title: string }>> {
  try {
    const document = getDocumentById(params.documentId);

    if (!document) {
      return {
        success: false,
        error: `Document not found: ${params.documentId}`,
      };
    }

    if (document.status !== 'indexed') {
      return {
        success: false,
        error: `Document is not indexed. Status: ${document.status}`,
      };
    }

    // Get all chunks for the document
    const chunks = getChunksByDocumentId(params.documentId);

    if (chunks.length === 0) {
      return {
        success: false,
        error: 'Document has no indexed content',
      };
    }

    // Combine chunks to form document content
    const content = chunks
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map(c => c.content)
      .join('\n\n');

    const summarizer = getSummarizer();
    const style: SummaryStyle = params.style ?? 'brief';
    const title = document.metadata.title ?? document.filename;

    const summary = await summarizer.summarize(content, style, title as string);

    return {
      success: true,
      data: {
        summary,
        documentId: params.documentId,
        title: title as string,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
