/**
 * RAG MCP Server - REST API Entry Point
 */

import { serve } from '@hono/node-server';
import { createApp } from './server.js';

const PORT = parseInt(process.env.API_PORT || '3001', 10);
const HOST = process.env.API_HOST || '0.0.0.0';

const app = createApp();

console.log(`

  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║   RAG MCP Server - REST API                         ║
  ║                                                      ║
  ║   Server running at http://${HOST}:${PORT}              ║
  ║                                                      ║
  ║   Endpoints:                                         ║
  ║   • GET  /api/health          - Health check        ║
  ║   • POST /api/documents/upload - Upload document    ║
  ║   • GET  /api/documents       - List documents      ║
  ║   • GET  /api/documents/:id   - Get document        ║
  ║   • DELETE /api/documents/:id - Delete document     ║
  ║   • POST /api/search          - Search documents    ║
  ║   • POST /api/ask             - Ask question        ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝

`);

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
});
