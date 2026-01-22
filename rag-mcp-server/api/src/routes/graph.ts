/**
 * Knowledge Graph routes
 * Returns nodes (documents) and links (relationships) for visualization
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getAllDocuments, getDocumentById } from '../../../src/storage/sqlite.js';
import type { Document } from '../../../src/types/index.js';

const graph = new Hono();

// Query schema for graph endpoint
const graphQuerySchema = z.object({
  collection: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(500),
});

// Node color scheme by file type
const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444',   // Red
  docx: '#3b82f6',  // Blue
  pptx: '#f97316',  // Orange
  xlsx: '#22c55e',  // Green
  md: '#8b5cf6',    // Purple
  txt: '#6b7280',   // Gray
  html: '#06b6d4',  // Cyan
  csv: '#84cc16',   // Lime
  json: '#eab308',  // Yellow
};

interface GraphNode {
  id: string;
  type: string;
  label: string;
  tags: string[];
  collection?: string;
  color: string;
  chunkCount: number;
  fileSize: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
  weight: number;
}

/**
 * Generate links between documents based on relationships
 * - Same collection
 * - Shared tags
 * - Similar file types
 */
function generateLinks(documents: Document[]): GraphLink[] {
  const links: GraphLink[] = [];
  const linkSet = new Set<string>(); // Prevent duplicates

  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const docA = documents[i];
      const docB = documents[j];
      const linkKey = `${docA.id}-${docB.id}`;

      if (linkSet.has(linkKey)) continue;

      let weight = 0;
      const relationshipTypes: string[] = [];

      // Same collection = strong link
      if (docA.collectionId && docA.collectionId === docB.collectionId) {
        weight += 0.8;
        relationshipTypes.push('collection');
      }

      // Shared tags = moderate link
      const tagsA = new Set(docA.tags || []);
      const tagsB = new Set(docB.tags || []);
      const sharedTags = [...tagsA].filter(t => tagsB.has(t));
      if (sharedTags.length > 0) {
        weight += Math.min(0.3 * sharedTags.length, 0.6);
        relationshipTypes.push('tags');
      }

      // Same file type = weak link
      if (docA.fileType === docB.fileType) {
        weight += 0.1;
        relationshipTypes.push('type');
      }

      // Only add links with sufficient weight
      if (weight > 0.3) {
        linkSet.add(linkKey);
        links.push({
          source: docA.id,
          target: docB.id,
          type: relationshipTypes.join('+'),
          weight: Math.min(weight, 1.0),
        });
      }
    }
  }

  // Limit to 3000 links for performance
  return links.slice(0, 3000);
}

/**
 * GET /api/graph
 * Returns nodes and links for knowledge graph visualization
 */
graph.get('/', zValidator('query', graphQuerySchema), async (c) => {
  const query = c.req.valid('query');

  try {
    let documents = getAllDocuments()
      .filter(d => d.status === 'indexed');

    // Filter by collection if specified
    if (query.collection) {
      documents = documents.filter(d => d.collectionId === query.collection);
    }

    // Limit number of nodes
    documents = documents.slice(0, query.limit);

    // Transform documents to graph nodes
    const nodes: GraphNode[] = documents.map(doc => ({
      id: doc.id,
      type: doc.fileType,
      label: doc.filename,
      tags: doc.tags || [],
      collection: doc.collectionId,
      color: FILE_TYPE_COLORS[doc.fileType] || '#6b7280',
      chunkCount: doc.chunkCount,
      fileSize: doc.fileSize,
    }));

    // Generate links based on relationships
    const links = generateLinks(documents);

    return c.json({
      success: true,
      data: {
        nodes,
        links,
        stats: {
          nodeCount: nodes.length,
          linkCount: links.length,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate graph';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/graph/document/:id
 * Returns graph data centered on a specific document
 */
graph.get('/document/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const doc = getDocumentById(id);
    if (!doc) {
      return c.json({
        success: false,
        error: `Document ${id} not found`,
      }, 404);
    }

    // Get all related documents
    let related = getAllDocuments()
      .filter(d => d.status === 'indexed' && d.id !== id);

    // Find documents related by collection or tags
    const docTags = new Set(doc.tags || []);
    related = related.filter(d => {
      // Same collection
      if (doc.collectionId && d.collectionId === doc.collectionId) return true;
      // Shared tags
      const dTags = d.tags || [];
      if (dTags.some(t => docTags.has(t))) return true;
      return false;
    }).slice(0, 50);

    // Build nodes including the center document
    const allDocs = [doc, ...related];
    const nodes: GraphNode[] = allDocs.map(d => ({
      id: d.id,
      type: d.fileType,
      label: d.filename,
      tags: d.tags || [],
      collection: d.collectionId,
      color: FILE_TYPE_COLORS[d.fileType] || '#6b7280',
      chunkCount: d.chunkCount,
      fileSize: d.fileSize,
    }));

    const links = generateLinks(allDocs);

    return c.json({
      success: true,
      data: {
        centerDocument: {
          id: doc.id,
          filename: doc.filename,
          summary: doc.summary,
        },
        nodes,
        links,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get document graph';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/graph/random
 * Returns a random indexed document (for "wisdom" feature)
 */
graph.get('/random', async (c) => {
  try {
    const documents = getAllDocuments()
      .filter(d => d.status === 'indexed');

    if (documents.length === 0) {
      return c.json({
        success: false,
        error: 'No indexed documents available',
      }, 404);
    }

    const randomIndex = Math.floor(Math.random() * documents.length);
    const doc = documents[randomIndex];

    return c.json({
      success: true,
      data: {
        id: doc.id,
        filename: doc.filename,
        fileType: doc.fileType,
        summary: doc.summary,
        tags: doc.tags,
        chunkCount: doc.chunkCount,
        createdAt: doc.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get random document';
    return c.json({ success: false, error: message }, 500);
  }
});

export default graph;
