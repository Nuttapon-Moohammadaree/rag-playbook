/**
 * MCP Server - stdio transport for Claude Code integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, getTool, zodToJsonSchema } from './tools/index.js';
import { getDatabase, closeDatabase } from '../storage/sqlite.js';
import { ensureCollection } from '../storage/qdrant.js';
import { sanitizeError } from '../utils/security.js';

const SERVER_NAME = 'rag-mcp-server';
const SERVER_VERSION = '1.0.0';

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = getTool(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Unknown tool: ${name}`,
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      // Validate input
      const validatedArgs = tool.inputSchema.parse(args);

      // Execute tool
      const result = await tool.handler(validatedArgs);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    } catch (error) {
      // Log full error internally for debugging
      console.error('Tool execution error:', error);

      // Return sanitized error to client
      const safeMessage = sanitizeError(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Tool execution failed: ${safeMessage}`,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Initialize storage backends
 */
async function initializeStorage(): Promise<void> {
  // Initialize SQLite
  getDatabase();

  // Initialize Qdrant collection
  await ensureCollection();
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  try {
    // Initialize storage
    await initializeStorage();

    // Create server
    const server = createServer();

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    // Handle graceful shutdown
    const shutdown = async () => {
      closeDatabase();
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Log startup (to stderr so it doesn't interfere with MCP protocol on stdout)
    console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main().catch(console.error);
