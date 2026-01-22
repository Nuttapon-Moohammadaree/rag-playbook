/**
 * Document management routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

// Import core services
import { getIngestionService } from '../../../src/core/ingestion/service.js';
import { getAllDocuments, getDocumentById, getChunksByDocumentId } from '../../../src/storage/sqlite.js';
import type { Document } from '../../../src/types/index.js';

// Upload directory for files
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/data/uploads';

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
 * Upload file via multipart form data and index it
 * POST /api/documents/upload-file
 */
documents.post('/upload-file', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json({
        success: false,
        error: 'No file provided. Please upload a file.',
      }, 400);
    }

    // Validate file type
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/html',
      'application/pdf',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-powerpoint',
    ];

    const allowedExtensions = ['.txt', '.md', '.csv', '.html', '.pdf', '.json', '.docx', '.pptx', '.doc', '.ppt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return c.json({
        success: false,
        error: `File type not supported. Allowed: ${allowedExtensions.join(', ')}`,
      }, 400);
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${timestamp}_${safeFilename}`;
    const filepath = join(UPLOAD_DIR, uniqueFilename);

    // Save file to disk
    const buffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(buffer));

    // Index the document
    const ingestionService = getIngestionService();
    const result = await ingestionService.indexDocument(filepath, {
      chunkSize: 512,
      chunkOverlap: 50,
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
        filename: file.name,
        status: result.status,
        chunkCount: result.chunkCount,
        message: 'Document uploaded and indexed successfully',
      },
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File upload failed';
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
 * Get document with chunks (full content)
 * GET /api/documents/:id/content
 */
documents.get('/:id/content', async (c) => {
  const id = c.req.param('id');

  try {
    const doc = getDocumentById(id);

    if (!doc) {
      return c.json({
        success: false,
        error: `Document ${id} not found`,
      }, 404);
    }

    // Get all chunks for this document
    const chunks = getChunksByDocumentId(id)
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        chunkIndex: chunk.chunk_index,
        tokenCount: chunk.token_count,
      }));

    // Combine chunks into full content
    const fullContent = chunks.map(c => c.content).join('\n\n---\n\n');

    return c.json({
      success: true,
      data: {
        ...serializeDocument(doc),
        chunks,
        fullContent,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get document content';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get neighboring documents (prev/next) for navigation
 * GET /api/documents/:id/neighbors
 */
documents.get('/:id/neighbors', async (c) => {
  const id = c.req.param('id');

  try {
    const doc = getDocumentById(id);

    if (!doc) {
      return c.json({
        success: false,
        error: `Document ${id} not found`,
      }, 404);
    }

    // Get all indexed documents sorted by creation date
    const allDocs = getAllDocuments()
      .filter(d => d.status === 'indexed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const currentIndex = allDocs.findIndex(d => d.id === id);

    const prev = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
    const next = currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

    return c.json({
      success: true,
      data: {
        current: { id: doc.id, filename: doc.filename, index: currentIndex },
        prev: prev ? { id: prev.id, filename: prev.filename } : null,
        next: next ? { id: next.id, filename: next.filename } : null,
        total: allDocs.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get neighbors';
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
