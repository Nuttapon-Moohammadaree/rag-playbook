/**
 * Analytics and query logs routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Import storage functions
import {
  getQueryStats,
  getQueryTrends,
  getTopQueries,
  getRecentQueryLogs,
  type QueryLog,
  type QueryStats,
  type QueryTrend,
  type TopQuery,
} from '../../../src/storage/sqlite.js';

const analytics = new Hono();

// Validation schemas
const queryLogsSchema = z.object({
  limit: z.coerce.number().min(1).max(500).optional().default(100),
  type: z.enum(['search', 'ask']).optional(),
});

const trendsSchema = z.object({
  days: z.coerce.number().min(1).max(90).optional().default(7),
});

const topQueriesSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  type: z.enum(['search', 'ask']).optional(),
});

/**
 * Serialize a QueryLog for API response
 */
function serializeQueryLog(log: QueryLog) {
  return {
    id: log.id,
    query: log.query,
    queryType: log.queryType,
    source: log.source,
    resultCount: log.resultCount,
    topScore: log.topScore,
    latencyMs: log.latencyMs,
    createdAt: log.createdAt.toISOString(),
  };
}

/**
 * Get overall analytics statistics
 * GET /api/analytics/stats
 */
analytics.get('/stats', async (c) => {
  try {
    const stats: QueryStats = getQueryStats();

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get analytics stats';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get query trends over time
 * GET /api/analytics/trends
 */
analytics.get('/trends', zValidator('query', trendsSchema), async (c) => {
  const { days } = c.req.valid('query');

  try {
    const trends: QueryTrend[] = getQueryTrends(days);

    return c.json({
      success: true,
      data: {
        trends,
        period: {
          days,
          start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get query trends';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get top queries
 * GET /api/analytics/top-queries
 */
analytics.get('/top-queries', zValidator('query', topQueriesSchema), async (c) => {
  const { limit, type } = c.req.valid('query');

  try {
    const topQueries: TopQuery[] = getTopQueries(limit, type);

    return c.json({
      success: true,
      data: {
        queries: topQueries.map(q => ({
          query: q.query,
          count: q.count,
          avgLatencyMs: q.avgLatencyMs,
          lastUsed: q.lastUsed.toISOString(),
        })),
        total: topQueries.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get top queries';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * Get recent query logs
 * GET /api/analytics/queries
 */
analytics.get('/queries', zValidator('query', queryLogsSchema), async (c) => {
  const { limit, type } = c.req.valid('query');

  try {
    const logs: QueryLog[] = getRecentQueryLogs(limit, type);

    return c.json({
      success: true,
      data: {
        queries: logs.map(serializeQueryLog),
        total: logs.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get query logs';
    return c.json({ success: false, error: message }, 500);
  }
});

export default analytics;
