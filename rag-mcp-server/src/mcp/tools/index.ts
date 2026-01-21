/**
 * MCP Tool Registry
 */

import { z } from 'zod';
import {
  indexDocument,
  indexDocumentSchema,
  listDocuments,
  listDocumentsSchema,
  deleteDocument,
  deleteDocumentSchema,
  getDocument,
  getDocumentSchema,
  indexText,
  indexTextSchema,
} from './documents.js';
import { search, searchSchema } from './search.js';
import { ask, askSchema } from './ask.js';
import { summarizeDocument, summarizeDocumentSchema } from './llm.js';
import type { ToolResult } from '../../types/index.js';

// Tool definitions for MCP
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (params: unknown) => Promise<ToolResult>;
}

export const tools: ToolDefinition[] = [
  {
    name: 'index_document',
    description: 'Index a document file for semantic search. Supports TXT, MD, DOCX, and PDF files.',
    inputSchema: indexDocumentSchema,
    handler: async (params) => indexDocument(params as z.infer<typeof indexDocumentSchema>),
  },
  {
    name: 'list_documents',
    description: 'List all indexed documents with optional filtering by status or file type.',
    inputSchema: listDocumentsSchema,
    handler: async (params) => listDocuments(params as z.infer<typeof listDocumentsSchema>),
  },
  {
    name: 'delete_document',
    description: 'Delete an indexed document and all its chunks from the search index.',
    inputSchema: deleteDocumentSchema,
    handler: async (params) => deleteDocument(params as z.infer<typeof deleteDocumentSchema>),
  },
  {
    name: 'get_document',
    description: 'Get details about a specific indexed document by ID.',
    inputSchema: getDocumentSchema,
    handler: async (params) => getDocument(params as z.infer<typeof getDocumentSchema>),
  },
  {
    name: 'index_text',
    description: 'Index raw text content for semantic search without needing a file. Useful for indexing notes, API responses, or dynamically generated content.',
    inputSchema: indexTextSchema,
    handler: async (params) => indexText(params as z.infer<typeof indexTextSchema>),
  },
  {
    name: 'search',
    description: 'Search for relevant document chunks using semantic similarity. Returns chunks ranked by relevance score.',
    inputSchema: searchSchema,
    handler: async (params) => search(params as z.infer<typeof searchSchema>),
  },
  {
    name: 'ask',
    description: 'Ask a question and get an answer based on indexed documents using RAG (Retrieval Augmented Generation). Returns the answer along with source citations.',
    inputSchema: askSchema,
    handler: async (params) => ask(params as z.infer<typeof askSchema>),
  },
  {
    name: 'summarize_document',
    description: 'Generate a summary of an indexed document using LLM. Supports different styles: brief (2-3 sentences), detailed (comprehensive), or bullet_points (list format).',
    inputSchema: summarizeDocumentSchema,
    handler: async (params) => summarizeDocument(params as z.infer<typeof summarizeDocumentSchema>),
  },
];

/**
 * Get tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(t => t.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return tools.map(t => t.name);
}

/**
 * Convert Zod schema to JSON Schema for MCP
 */
export function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // Use zod's built-in JSON schema conversion
  // For now, we'll implement a simple converter for our specific schemas

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType<unknown>>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const { schema: propSchema, isOptional } = unwrapZodType(value);
      properties[key] = zodTypeToJsonSchema(propSchema);

      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object' };
}

function unwrapZodType(schema: z.ZodType<unknown>): { schema: z.ZodType<unknown>; isOptional: boolean } {
  if (schema instanceof z.ZodOptional) {
    return { schema: schema.unwrap(), isOptional: true };
  }
  if (schema instanceof z.ZodDefault) {
    return { schema: schema.removeDefault(), isOptional: true };
  }
  return { schema, isOptional: false };
}

function zodTypeToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: 'boolean' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: 'string',
      enum: schema.options,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: 'array',
      items: zodTypeToJsonSchema(schema.element),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(schema.unwrap());
  }

  return { type: 'string' };
}
