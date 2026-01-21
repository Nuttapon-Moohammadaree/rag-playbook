/**
 * MCP tools for document management
 */

import { z } from 'zod';
import { getIngestionService } from '../../core/ingestion/service.js';
import { getAllDocuments, getDocumentById } from '../../storage/sqlite.js';
import type { ToolResult, Document } from '../../types/index.js';
import {
  indexRateLimiter,
  isValidUUID,
  sanitizeError,
} from '../../utils/security.js';

// Constants for size limits
const MAX_CONTENT_SIZE = 1_000_000;  // 1MB max content
const MAX_METADATA_SIZE = 100_000;   // 100KB max metadata

// Tool schemas
export const indexDocumentSchema = z.object({
  path: z.string().describe('Absolute path to the document file'),
  force: z.boolean().optional().describe('Force reindex even if already indexed'),
});

export const listDocumentsSchema = z.object({
  status: z.enum(['pending', 'processing', 'indexed', 'failed']).optional()
    .describe('Filter by document status'),
  fileType: z.enum(['txt', 'md', 'docx', 'pdf', 'pptx', 'xlsx', 'csv', 'html', 'json', 'rtf']).optional()
    .describe('Filter by file type'),
});

export const deleteDocumentSchema = z.object({
  documentId: z.string()
    .refine(isValidUUID, { message: 'Invalid document ID format: must be a valid UUID' })
    .describe('Document ID to delete'),
});

export const getDocumentSchema = z.object({
  documentId: z.string()
    .refine(isValidUUID, { message: 'Invalid document ID format: must be a valid UUID' })
    .describe('Document ID to retrieve'),
});

export const indexTextSchema = z.object({
  content: z.string()
    .min(1)
    .max(MAX_CONTENT_SIZE, { message: `Content exceeds maximum size of ${MAX_CONTENT_SIZE} characters` })
    .describe('Text content to index'),
  title: z.string()
    .min(1)
    .max(500, { message: 'Title exceeds maximum length of 500 characters' })
    .describe('Title for the indexed content'),
  metadata: z.record(z.unknown())
    .optional()
    .refine(
      (val) => !val || JSON.stringify(val).length <= MAX_METADATA_SIZE,
      { message: `Metadata exceeds maximum size of ${MAX_METADATA_SIZE} characters` }
    )
    .describe('Optional metadata object'),
});

// Tool implementations
export async function indexDocument(
  params: z.infer<typeof indexDocumentSchema>
): Promise<ToolResult<{ documentId: string; chunkCount: number }>> {
  try {
    // Check rate limit
    if (!indexRateLimiter.isAllowed('index_document')) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please wait before indexing more documents.',
      };
    }

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

export async function indexText(
  params: z.infer<typeof indexTextSchema>
): Promise<ToolResult<{ documentId: string; chunkCount: number }>> {
  try {
    // Check rate limit
    if (!indexRateLimiter.isAllowed('index_text')) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please wait before indexing more content.',
      };
    }

    const ingestionService = getIngestionService();
    const result = await ingestionService.indexText(
      params.content,
      params.title,
      params.metadata
    );

    if (result.status === 'failed') {
      return {
        success: false,
        error: result.error ?? 'Failed to index text',
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
