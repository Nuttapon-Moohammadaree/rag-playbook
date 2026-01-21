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
  // Handle wrapped types first
  if (schema instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    return zodTypeToJsonSchema(schema.removeDefault());
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodTypeToJsonSchema(schema.unwrap());
    return { ...inner, nullable: true };
  }

  // Handle effects (refinements, transforms)
  if (schema instanceof z.ZodEffects) {
    return zodTypeToJsonSchema(schema.innerType());
  }

  // Primitive types
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (schema.description) result.description = schema.description;
    // Extract min/max length from checks
    const checks = (schema as unknown as { _def: { checks: Array<{ kind: string; value: number }> } })._def.checks ?? [];
    for (const check of checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
    }
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (schema.description) result.description = schema.description;
    // Extract min/max from checks
    const checks = (schema as unknown as { _def: { checks: Array<{ kind: string; value: number }> } })._def.checks ?? [];
    for (const check of checks) {
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
    }
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

  // Object type (nested)
  if (schema instanceof z.ZodObject) {
    return zodToJsonSchema(schema);
  }

  // Record type (dictionary)
  if (schema instanceof z.ZodRecord) {
    const result: Record<string, unknown> = {
      type: 'object',
      additionalProperties: zodTypeToJsonSchema(schema.valueSchema),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Union type
  if (schema instanceof z.ZodUnion) {
    const options = (schema as unknown as { options: z.ZodType<unknown>[] }).options;
    return {
      oneOf: options.map((opt: z.ZodType<unknown>) => zodTypeToJsonSchema(opt)),
    };
  }

  // Literal type
  if (schema instanceof z.ZodLiteral) {
    const value = (schema as unknown as { value: unknown }).value;
    return { type: typeof value, const: value };
  }

  // Null type
  if (schema instanceof z.ZodNull) {
    return { type: 'null' };
  }

  // Unknown/Any - use empty object schema
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return {};
  }

  // Fallback to string
  return { type: 'string' };
}
