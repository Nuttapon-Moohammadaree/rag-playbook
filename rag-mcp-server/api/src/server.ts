/**
 * Hono REST API Server
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

import health from './routes/health.js';
import documents from './routes/documents.js';
import search from './routes/search.js';
import ask from './routes/ask.js';
import collections from './routes/collections.js';
import analytics from './routes/analytics.js';
import graph from './routes/graph.js';

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use('*', timing());
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use('*', corsMiddleware);
  app.use('*', errorHandler);

  // Rate limiting for API routes
  app.use('/api/*', rateLimitMiddleware({ windowMs: 60000, maxRequests: 100 }));

  // Mount routes
  app.route('/api/health', health);
  app.route('/api/documents', documents);
  app.route('/api/search', search);
  app.route('/api/ask', ask);
  app.route('/api/collections', collections);
  app.route('/api/analytics', analytics);
  app.route('/api/graph', graph);

  // Root endpoint
  app.get('/', (c) => {
    return c.json({
      name: 'RAG MCP Server API',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        documents: '/api/documents',
        collections: '/api/collections',
        search: '/api/search',
        ask: '/api/ask',
        analytics: '/api/analytics',
        graph: '/api/graph',
      },
      documentation: '/api/docs',
    });
  });

  // 404 handler
  app.notFound(notFoundHandler);

  return app;
}

export type App = ReturnType<typeof createApp>;
