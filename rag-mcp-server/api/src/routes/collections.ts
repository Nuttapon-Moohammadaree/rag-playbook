/**
 * Collection management routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { randomUUID } from 'crypto';

// Import storage functions
import {
  getAllCollections,
  getCollectionById,
  getCollectionByName,
  insertCollection,
  updateCollection,
  deleteCollection as deleteCollectionFromDb,
  assignDocumentToCollection,
  getDocumentsByCollectionId,
  type Collection,
} from '../../../src/storage/sqlite.js';

const collections = new Hono();

// Validation schemas
const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#6366f1'),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const assignDocumentSchema = z.object({
  documentId: z.string().min(1),
});

/**
 * Serialize a Collection for API response
 */
function serializeCollection(collection: Collection) {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    color: collection.color,
    documentCount: collection.documentCount,
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}

/**
 * List all collections
 * GET /api/collections
 */
collections.get('/', async (c) => {
  try {
    const allCollections = getAllCollections();

    return c.json({
      success: true,
      data: {
        collections: allCollections.map(serializeCollection),
        total: allCollections.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list collections';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Create a new collection
 * POST /api/collections
 */
collections.post('/', zValidator('json', createCollectionSchema), async (c) => {
  const body = c.req.valid('json');

  try {
    // Check if collection with same name exists
    const existing = getCollectionByName(body.name);
    if (existing) {
      return c.json({
        success: false,
        error: `Collection with name "${body.name}" already exists`,
      }, 409);
    }

    const collection = insertCollection({
      id: randomUUID(),
      name: body.name,
      description: body.description,
      color: body.color,
    });

    return c.json({
      success: true,
      data: serializeCollection(collection),
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create collection';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get collection by ID
 * GET /api/collections/:id
 */
collections.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const collection = getCollectionById(id);

    if (!collection) {
      return c.json({
        success: false,
        error: `Collection ${id} not found`,
      }, 404);
    }

    return c.json({
      success: true,
      data: serializeCollection(collection),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get collection';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Update collection
 * PUT /api/collections/:id
 */
collections.put('/:id', zValidator('json', updateCollectionSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const existing = getCollectionById(id);
    if (!existing) {
      return c.json({
        success: false,
        error: `Collection ${id} not found`,
      }, 404);
    }

    // Check if new name conflicts with existing collection
    if (body.name && body.name !== existing.name) {
      const nameConflict = getCollectionByName(body.name);
      if (nameConflict) {
        return c.json({
          success: false,
          error: `Collection with name "${body.name}" already exists`,
        }, 409);
      }
    }

    updateCollection(id, body);

    const updated = getCollectionById(id);
    return c.json({
      success: true,
      data: serializeCollection(updated!),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update collection';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Delete collection
 * DELETE /api/collections/:id
 */
collections.delete('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const existing = getCollectionById(id);
    if (!existing) {
      return c.json({
        success: false,
        error: `Collection ${id} not found`,
      }, 404);
    }

    const deleted = deleteCollectionFromDb(id);

    if (!deleted) {
      return c.json({
        success: false,
        error: `Failed to delete collection ${id}`,
      }, 500);
    }

    return c.json({
      success: true,
      data: {
        collectionId: id,
        message: 'Collection deleted successfully',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete collection';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get documents in collection
 * GET /api/collections/:id/documents
 */
collections.get('/:id/documents', async (c) => {
  const id = c.req.param('id');

  try {
    const collection = getCollectionById(id);
    if (!collection) {
      return c.json({
        success: false,
        error: `Collection ${id} not found`,
      }, 404);
    }

    const documents = getDocumentsByCollectionId(id);

    return c.json({
      success: true,
      data: {
        collection: serializeCollection(collection),
        documents: documents.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          filepath: doc.filepath,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          status: doc.status,
          chunkCount: doc.chunkCount,
          createdAt: doc.createdAt.toISOString(),
        })),
        total: documents.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get collection documents';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Add document to collection
 * POST /api/collections/:id/documents
 */
collections.post('/:id/documents', zValidator('json', assignDocumentSchema), async (c) => {
  const collectionId = c.req.param('id');
  const { documentId } = c.req.valid('json');

  try {
    const collection = getCollectionById(collectionId);
    if (!collection) {
      return c.json({
        success: false,
        error: `Collection ${collectionId} not found`,
      }, 404);
    }

    assignDocumentToCollection(documentId, collectionId);

    return c.json({
      success: true,
      data: {
        collectionId,
        documentId,
        message: 'Document added to collection',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add document to collection';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Remove document from collection
 * DELETE /api/collections/:id/documents/:documentId
 */
collections.delete('/:id/documents/:documentId', async (c) => {
  const collectionId = c.req.param('id');
  const documentId = c.req.param('documentId');

  try {
    const collection = getCollectionById(collectionId);
    if (!collection) {
      return c.json({
        success: false,
        error: `Collection ${collectionId} not found`,
      }, 404);
    }

    assignDocumentToCollection(documentId, null);

    return c.json({
      success: true,
      data: {
        collectionId,
        documentId,
        message: 'Document removed from collection',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove document from collection';
    return c.json({ success: false, error: message }, 500);
  }
});

export default collections;
