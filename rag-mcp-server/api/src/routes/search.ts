/**
 * Search routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

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

  try {
    // TODO: Connect to actual retrieval service
    // const retrievalService = getRetrievalService();
    // const { results, metadata } = await retrievalService.searchWithMetadata({
    //   query: body.query,
    //   limit: body.limit,
    //   threshold: body.threshold,
    //   rerank: body.rerank,
    //   expand: body.expand,
    //   hyde: body.hyde,
    //   filters: body.filters,
    // });

    // Placeholder response
    return c.json({
      success: true,
      data: {
        results: [],
        metadata: {
          query: body.query,
          rerankUsed: body.rerank,
          hydeUsed: body.hyde,
          queryExpanded: body.expand,
          originalQuery: body.query,
          totalResults: 0,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return c.json({ success: false, error: message }, 500);
  }
});

export default search;
