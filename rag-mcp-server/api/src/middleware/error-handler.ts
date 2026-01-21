/**
 * Error handling middleware
 */

import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export async function errorHandler(c: Context, next: Next) {
  // Generate request ID
  const requestId = crypto.randomUUID();
  c.header('X-Request-Id', requestId);
  c.set('requestId', requestId);

  try {
    await next();
  } catch (err) {
    console.error(`[${requestId}] Error:`, err);

    // Handle Zod validation errors
    if (err instanceof ZodError) {
      const response: ApiError = {
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: err.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
        requestId,
      };
      return c.json(response, 400);
    }

    // Handle HTTP exceptions
    if (err instanceof HTTPException) {
      const response: ApiError = {
        error: err.message,
        message: err.message,
        requestId,
      };
      return c.json(response, err.status);
    }

    // Handle generic errors
    const error = err as Error;
    const response: ApiError = {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message,
      requestId,
    };
    return c.json(response, 500);
  }
}

/**
 * Not found handler
 */
export function notFoundHandler(c: Context) {
  const response: ApiError = {
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
    requestId: c.get('requestId') || 'unknown',
  };
  return c.json(response, 404);
}
