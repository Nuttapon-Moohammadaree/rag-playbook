/**
 * Ask/QA routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Import core services
import { getAskService } from '../../../src/core/ask/service.js';

const ask = new Hono();

// Validation schemas
const askSchema = z.object({
  question: z.string().min(1).max(2000),
  limit: z.number().min(1).max(20).optional().default(5),
  threshold: z.number().min(0).max(1).optional().default(0.5),
  model: z.string().optional(),
  rerank: z.boolean().optional().default(true),
  verify: z.boolean().optional().default(false),
});

/**
 * Ask a question
 * POST /api/ask
 */
ask.post('/', zValidator('json', askSchema), async (c) => {
  const body = c.req.valid('json');

  try {
    const askService = getAskService();
    const result = await askService.ask({
      question: body.question,
      limit: body.limit,
      threshold: body.threshold,
      model: body.model,
      rerank: body.rerank,
      verify: body.verify,
    });

    // Build response with optional verification data
    const response: Record<string, unknown> = {
      answer: result.answer,
      sources: result.sources,
      model: result.model,
      usage: result.usage,
      metadata: {
        question: body.question,
        rerankUsed: result.metadata?.rerankUsed ?? false,
        hydeUsed: result.metadata?.hydeUsed ?? false,
        queryExpanded: result.metadata?.queryExpanded ?? false,
        verificationEnabled: body.verify,
      },
    };

    // Include verification data if present
    if (result.verification) {
      response.verification = result.verification;
      response.confidence = result.confidence;
    }

    return c.json({
      success: true,
      data: response,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ask failed';
    return c.json({ success: false, error: message }, 500);
  }
});

export default ask;
