/**
 * Search routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Import core services
import { getRetrievalService } from '../../../src/core/retrieval/service.js';
import { insertQueryLog } from '../../../src/storage/sqlite.js';
import type { FileType, SearchFilters } from '../../../src/types/index.js';

const search = new Hono();

// Validation schemas
const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().min(1).max(50).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.5),
  rerank: z.boolean().optional().default(true),
  expand: z.boolean().optional().default(false),
  hyde: z.boolean().optional().default(false),
  filters: z.object({
    documentIds: z.array(z.string()).optional(),
    fileTypes: z.array(z.string()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }).optional(),
});

/**
 * Search documents
 * POST /api/search
 */
search.post('/', zValidator('json', searchSchema), async (c) => {
  const body = c.req.valid('json');
  const startTime = Date.now();

  try {
    const retrievalService = getRetrievalService();

    // Convert filters to proper types
    let filters: SearchFilters | undefined;
    if (body.filters) {
      filters = {
        documentIds: body.filters.documentIds,
        fileTypes: body.filters.fileTypes as FileType[] | undefined,
        dateFrom: body.filters.dateFrom ? new Date(body.filters.dateFrom) : undefined,
        dateTo: body.filters.dateTo ? new Date(body.filters.dateTo) : undefined,
      };
    }

    const { results, metadata } = await retrievalService.searchWithMetadata({
      query: body.query,
      limit: body.limit,
      threshold: body.threshold,
      rerank: body.rerank,
      expand: body.expand,
      hyde: body.hyde,
      filters,
    });

    const latencyMs = Date.now() - startTime;

    // Log the query for analytics
    try {
      insertQueryLog({
        query: body.query,
        queryType: 'search',
        source: 'api',
        resultCount: results.length,
        topScore: results.length > 0 ? results[0].score : null,
        latencyMs,
        metadata: {
          rerank: body.rerank,
          expand: body.expand,
          hyde: body.hyde,
        },
      });
    } catch {
      // Silently fail - don't break search if logging fails
    }

    // Serialize results for API response
    const serializedResults = results.map(r => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      content: r.content,
      score: Math.round(Math.max(0, Math.min(1, r.score)) * 1000) / 1000,
      document: {
        filename: r.document.filename,
        filepath: r.document.filepath,
        fileType: r.document.fileType,
      },
      metadata: r.metadata,
    }));

    return c.json({
      success: true,
      data: {
        results: serializedResults,
        metadata: {
          query: metadata.originalQuery,
          rerankUsed: metadata.rerankUsed,
          hydeUsed: metadata.hydeUsed,
          queryExpanded: metadata.queryExpanded,
          originalQuery: metadata.originalQuery,
          totalResults: results.length,
          latencyMs,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return c.json({ success: false, error: message }, 500);
  }
});

export default search;
