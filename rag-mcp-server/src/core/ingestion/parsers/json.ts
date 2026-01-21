/**
 * JSON file parser
 * Flattens JSON structure to searchable text
 */

import { readFile } from 'fs/promises';
import type { ParsedDocument, ParsedSection, DocumentMetadata } from '../../../types/index.js';

/**
 * Parse JSON file and convert to searchable text
 */
export async function parseJsonFile(filepath: string): Promise<ParsedDocument> {
  const raw = await readFile(filepath, 'utf-8');

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in file: ${filepath}`);
  }

  // Extract metadata from common fields
  const metadata = extractJsonMetadata(data, filepath);

  // Flatten JSON to readable text
  const content = flattenJson(data);

  // Create sections from top-level keys (if object)
  const sections = extractJsonSections(data);

  return {
    content,
    metadata,
    sections,
  };
}

/**
 * Extract metadata from common JSON fields
 */
function extractJsonMetadata(data: unknown, filepath: string): DocumentMetadata {
  const metadata: DocumentMetadata = { source: filepath };

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Common metadata field names
    if (typeof obj.title === 'string') metadata.title = obj.title;
    if (typeof obj.name === 'string' && !metadata.title) metadata.title = obj.name;
    if (typeof obj.author === 'string') metadata.author = obj.author;
    if (typeof obj.description === 'string') metadata.description = obj.description;
    if (typeof obj.summary === 'string' && !metadata.description) metadata.description = obj.summary;
    if (Array.isArray(obj.tags)) metadata.tags = obj.tags.filter(t => typeof t === 'string');
    if (Array.isArray(obj.keywords) && !metadata.tags) metadata.tags = obj.keywords.filter(t => typeof t === 'string');
    if (typeof obj.category === 'string') metadata.category = obj.category;
    if (typeof obj.type === 'string' && !metadata.category) metadata.category = obj.type;
  }

  return metadata;
}

/**
 * Flatten JSON to readable text format
 */
function flattenJson(data: unknown, prefix = '', depth = 0): string {
  const maxDepth = 10;
  if (depth > maxDepth) return '[max depth reached]';

  if (data === null || data === undefined) {
    return prefix ? `${prefix}: null` : '';
  }

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return prefix ? `${prefix}: ${data}` : String(data);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return prefix ? `${prefix}: []` : '';
    }

    // If array of primitives, join them
    if (data.every(item => typeof item !== 'object' || item === null)) {
      return prefix ? `${prefix}: ${data.join(', ')}` : data.join(', ');
    }

    // Array of objects
    const items = data.map((item, i) => {
      const itemPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
      return flattenJson(item, itemPrefix, depth + 1);
    });
    return items.join('\n');
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const lines: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      lines.push(flattenJson(value, newPrefix, depth + 1));
    }

    return lines.join('\n');
  }

  return '';
}

/**
 * Extract sections from top-level JSON keys
 */
function extractJsonSections(data: unknown): ParsedSection[] {
  const sections: ParsedSection[] = [];

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      // Skip common metadata fields
      if (['title', 'name', 'author', 'description', 'summary', 'tags', 'keywords', 'category', 'type', 'version', 'id'].includes(key)) {
        continue;
      }

      const content = flattenJson(value, '', 0);
      if (content.trim()) {
        sections.push({
          title: key,
          content: content.trim(),
        });
      }
    }
  } else if (Array.isArray(data)) {
    // For arrays, create sections for each item
    data.forEach((item, i) => {
      const content = flattenJson(item, '', 0);
      if (content.trim()) {
        sections.push({
          title: `Item ${i + 1}`,
          content: content.trim(),
        });
      }
    });
  }

  return sections;
}
