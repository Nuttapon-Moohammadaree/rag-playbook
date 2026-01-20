/**
 * MCP tools for document management
 */

import { z } from 'zod';
import { getIngestionService } from '../../core/ingestion/service.js';
import { getAllDocuments, getDocumentById } from '../../storage/sqlite.js';
import type { ToolResult, Document } from '../../types/index.js';

// Tool schemas
export const indexDocumentSchema = z.object({
  path: z.string().describe('Absolute path to the document file'),
  force: z.boolean().optional().describe('Force reindex even if already indexed'),
});

export const listDocumentsSchema = z.object({
  status: z.enum(['pending', 'processing', 'indexed', 'failed']).optional()
    .describe('Filter by document status'),
  fileType: z.enum(['txt', 'md', 'docx', 'pdf']).optional()
    .describe('Filter by file type'),
});

export const deleteDocumentSchema = z.object({
  documentId: z.string().describe('Document ID to delete'),
});

export const getDocumentSchema = z.object({
  documentId: z.string().describe('Document ID to retrieve'),
});

// Tool implementations
export async function indexDocument(
  params: z.infer<typeof indexDocumentSchema>
): Promise<ToolResult<{ documentId: string; chunkCount: number }>> {
  try {
    const ingestionService = getIngestionService();
    const result = await ingestionService.indexDocument(params.path, {
      forceReindex: params.force,
    });

    if (result.status === 'failed') {
      return {
        success: false,
        error: result.error ?? 'Failed to index document',
      };
    }

    return {
      success: true,
      data: {
        documentId: result.documentId,
        chunkCount: result.chunkCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listDocuments(
  params: z.infer<typeof listDocumentsSchema>
): Promise<ToolResult<{ documents: DocumentSummary[]; total: number }>> {
  try {
    let documents = getAllDocuments();

    // Apply filters
    if (params.status) {
      documents = documents.filter(d => d.status === params.status);
    }
    if (params.fileType) {
      documents = documents.filter(d => d.fileType === params.fileType);
    }

    const summaries: DocumentSummary[] = documents.map(d => ({
      id: d.id,
      filename: d.filename,
      filepath: d.filepath,
      fileType: d.fileType,
      status: d.status,
      chunkCount: d.chunkCount,
      indexedAt: d.indexedAt?.toISOString() ?? null,
    }));

    return {
      success: true,
      data: {
        documents: summaries,
        total: summaries.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deleteDocument(
  params: z.infer<typeof deleteDocumentSchema>
): Promise<ToolResult<{ deleted: boolean }>> {
  try {
    const ingestionService = getIngestionService();
    const deleted = await ingestionService.deleteDocument(params.documentId);

    return {
      success: true,
      data: { deleted },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getDocument(
  params: z.infer<typeof getDocumentSchema>
): Promise<ToolResult<Document | null>> {
  try {
    const document = getDocumentById(params.documentId);

    return {
      success: true,
      data: document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Types
interface DocumentSummary {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  status: string;
  chunkCount: number;
  indexedAt: string | null;
}
