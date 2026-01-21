/**
 * Tests for MCP tool registry - tool lookup, schema conversion, tool definitions
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { tools, getTool, getToolNames, zodToJsonSchema } from './index.js';

describe('MCP Tool Registry', () => {
  describe('Tool Definitions', () => {
    it('should have all expected tools registered', () => {
      const expectedTools = [
        'index_document',
        'list_documents',
        'delete_document',
        'get_document',
        'index_text',
        'search',
        'ask',
        'summarize_document',
      ];

      const registeredNames = getToolNames();
      for (const toolName of expectedTools) {
        expect(registeredNames).toContain(toolName);
      }
    });

    it('should have correct number of tools', () => {
      expect(tools.length).toBe(8);
    });

    it('should have name, description, inputSchema, and handler for each tool', () => {
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('should have meaningful descriptions', () => {
      for (const tool of tools) {
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('getTool', () => {
    it('should return tool definition for valid name', () => {
      const tool = getTool('search');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('search');
    });

    it('should return undefined for invalid name', () => {
      const tool = getTool('nonexistent_tool');
      expect(tool).toBeUndefined();
    });

    it('should return correct tool for each registered name', () => {
      for (const registeredTool of tools) {
        const foundTool = getTool(registeredTool.name);
        expect(foundTool).toBe(registeredTool);
      }
    });
  });

  describe('getToolNames', () => {
    it('should return array of tool names', () => {
      const names = getToolNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBe(tools.length);
    });

    it('should return names in same order as tools array', () => {
      const names = getToolNames();
      tools.forEach((tool, index) => {
        expect(names[index]).toBe(tool.name);
      });
    });
  });

  describe('zodToJsonSchema', () => {
    it('should convert simple string schema', () => {
      const schema = z.object({
        query: z.string().describe('Search query'),
      });

      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.properties).toBeDefined();
      const props = jsonSchema.properties as Record<string, { type: string; description?: string }>;
      expect(props.query.type).toBe('string');
      expect(props.query.description).toBe('Search query');
    });

    it('should convert number schema with description', () => {
      const schema = z.object({
        limit: z.number().describe('Maximum results'),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const props = jsonSchema.properties as Record<string, { type: string; description?: string }>;
      expect(props.limit.type).toBe('number');
      expect(props.limit.description).toBe('Maximum results');
    });

    it('should convert boolean schema', () => {
      const schema = z.object({
        enabled: z.boolean().describe('Enable feature'),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const props = jsonSchema.properties as Record<string, { type: string; description?: string }>;
      expect(props.enabled.type).toBe('boolean');
    });

    it('should convert enum schema', () => {
      const schema = z.object({
        status: z.enum(['pending', 'complete', 'failed']),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const props = jsonSchema.properties as Record<string, { type: string; enum?: string[] }>;
      expect(props.status.type).toBe('string');
      expect(props.status.enum).toEqual(['pending', 'complete', 'failed']);
    });

    it('should convert array schema', () => {
      const schema = z.object({
        ids: z.array(z.string()),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const props = jsonSchema.properties as Record<string, { type: string; items?: { type: string } }>;
      expect(props.ids.type).toBe('array');
      expect(props.ids.items).toEqual({ type: 'string' });
    });

    it('should mark required fields correctly', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const required = jsonSchema.required as string[] | undefined;
      expect(required).toContain('required');
      expect(required).not.toContain('optional');
    });

    it('should handle optional with default as optional', () => {
      const schema = z.object({
        withDefault: z.number().default(10),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const required = jsonSchema.required as string[] | undefined;
      expect(required ?? []).not.toContain('withDefault');
    });

    it('should return basic object schema for non-object input', () => {
      const schema = z.string();

      const jsonSchema = zodToJsonSchema(schema);
      expect(jsonSchema.type).toBe('object');
    });

    it('should handle complex nested optional', () => {
      const schema = z.object({
        name: z.string(),
        config: z.object({
          value: z.number(),
        }).optional(),
      });

      const jsonSchema = zodToJsonSchema(schema);
      const required = jsonSchema.required as string[] | undefined;
      expect(required).toContain('name');
      expect(required ?? []).not.toContain('config');
    });
  });

  describe('Tool Input Schemas', () => {
    it('search tool should have correct required fields', () => {
      const tool = getTool('search');
      const jsonSchema = zodToJsonSchema(tool!.inputSchema);
      const required = jsonSchema.required as string[];
      expect(required).toContain('query');
    });

    it('ask tool should have correct required fields', () => {
      const tool = getTool('ask');
      const jsonSchema = zodToJsonSchema(tool!.inputSchema);
      const required = jsonSchema.required as string[];
      expect(required).toContain('question');
    });

    it('index_document tool should have correct required fields', () => {
      const tool = getTool('index_document');
      const jsonSchema = zodToJsonSchema(tool!.inputSchema);
      const required = jsonSchema.required as string[];
      expect(required).toContain('path');
    });

    it('delete_document tool should have correct required fields', () => {
      const tool = getTool('delete_document');
      const jsonSchema = zodToJsonSchema(tool!.inputSchema);
      const required = jsonSchema.required as string[];
      expect(required).toContain('documentId');
    });

    it('index_text tool should have correct required fields', () => {
      const tool = getTool('index_text');
      const jsonSchema = zodToJsonSchema(tool!.inputSchema);
      const required = jsonSchema.required as string[];
      expect(required).toContain('content');
      expect(required).toContain('title');
    });
  });
});
