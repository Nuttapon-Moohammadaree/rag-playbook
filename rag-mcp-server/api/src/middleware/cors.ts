/**
 * CORS middleware configuration
 */

import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: ['http://localhost:8080', 'http://localhost:5173', 'http://127.0.0.1:8080'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['X-Total-Count', 'X-Request-Id'],
  maxAge: 86400,
  credentials: true,
});
