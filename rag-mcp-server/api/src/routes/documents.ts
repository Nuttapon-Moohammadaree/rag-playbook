/**
 * Document management routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Import core services
import { getIngestionService } from '../../../src/core/ingestion/service.js';
import { getAllDocuments, getDocumentById } from '../../../src/storage/sqlite.js';
import type { Document } from '../../../src/types/index.js';

const documents = new Hono();

// Validation schemas
const uploadSchema = z.object({
  filepath: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  chunkSize: z.number().min(50).max(10000).optional(),
  chunkOverlap: z.number().min(0).max(1000).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  status: z.enum(['pending', 'processing', 'indexed', 'failed']).optional(),
  fileType: z.string().optional(),
});

/**
 * Upload and index a document
 * POST /api/documents/upload
 */
documents.post('/upload', zValidator('json', uploadSchema), async (c) => {
  const body = c.req.valid('json');

  try {
    const ingestionService = getIngestionService();
    const result = await ingestionService.indexDocument(body.filepath, {
      chunkSize: body.chunkSize,
      chunkOverlap: body.chunkOverlap,
    });

    if (result.status === 'failed') {
      return c.json({
        success: false,
        error: result.error || 'Document indexing failed',
      }, 400);
    }

    return c.json({
      success: true,
      data: {
        documentId: result.documentId,
        filename: result.filename,
        status: result.status,
        chunkCount: result.chunkCount,
        message: 'Document indexed successfully',
      },
    }, result.status === 'success' ? 201 : 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Serialize a Document for API response
 */
function serializeDocument(doc: Document) {
  return {
    id: doc.id,
    filename: doc.filename,
    filepath: doc.filepath,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    status: doc.status,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    indexedAt: doc.indexedAt?.toISOString() ?? null,
    summary: doc.summary,
    tags: doc.tags,
    metadata: doc.metadata,
  };
}

/**
 * List documents
 * GET /api/documents
 */
documents.get('/', zValidator('query', listQuerySchema), async (c) => {
  const query = c.req.valid('query');

  try {
    let docs = getAllDocuments();

    // Apply filters
    if (query.status) {
      docs = docs.filter(d => d.status === query.status);
    }
    if (query.fileType) {
      docs = docs.filter(d => d.fileType === query.fileType);
    }

    const total = docs.length;

    // Apply pagination
    const paginatedDocs = docs.slice(query.offset, query.offset + query.limit);

    return c.json({
      success: true,
      data: {
        documents: paginatedDocs.map(serializeDocument),
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < total,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list documents';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get document by ID
 * GET /api/documents/:id
 */
documents.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const doc = getDocumentById(id);

    if (!doc) {
      return c.json({
        success: false,
        error: `Document ${id} not found`,
      }, 404);
    }

    return c.json({
      success: true,
      data: serializeDocument(doc),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get document';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Delete document
 * DELETE /api/documents/:id
 */
documents.delete('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    // Check if document exists first
    const doc = getDocumentById(id);
    if (!doc) {
      return c.json({
        success: false,
        error: `Document ${id} not found`,
      }, 404);
    }

    const ingestionService = getIngestionService();
    const deleted = await ingestionService.deleteDocument(id);

    if (!deleted) {
      return c.json({
        success: false,
        error: `Failed to delete document ${id}`,
      }, 500);
    }

    return c.json({
      success: true,
      data: {
        documentId: id,
        message: 'Document deleted successfully',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete document';
    return c.json({ success: false, error: message }, 500);
  }
});

export default documents;
