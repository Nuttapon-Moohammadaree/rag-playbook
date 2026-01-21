/**
 * Ask/QA routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

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
    // TODO: Connect to actual ask service
    // const askService = getAskService();
    // const result = await askService.ask({
    //   question: body.question,
    //   limit: body.limit,
    //   threshold: body.threshold,
    //   model: body.model,
    //   rerank: body.rerank,
    //   verify: body.verify,
    // });

    // Placeholder response
    return c.json({
      success: true,
      data: {
        answer: 'This is a placeholder response. Connect the ask service for actual answers.',
        sources: [],
        model: body.model || 'gpt-oss-120b',
        metadata: {
          question: body.question,
          rerankUsed: body.rerank,
          verificationEnabled: body.verify,
        },
        // Only present when verify=true
        ...(body.verify && {
          verification: {
            enabled: true,
            groundingScore: 0,
            isGrounded: false,
            unsupportedClaims: ['Service not connected'],
            citations: [],
            chunksFiltered: 0,
            verificationTimeMs: 0,
          },
          confidence: 0,
        }),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ask failed';
    return c.json({ success: false, error: message }, 500);
  }
});

export default ask;
