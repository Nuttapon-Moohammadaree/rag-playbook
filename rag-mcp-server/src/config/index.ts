/**
 * Configuration management for RAG MCP Server
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Config } from '../types/index.js';

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number, min?: number, max?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  // Validate bounds if specified
  if (min !== undefined && parsed < min) {
    throw new Error(`Environment variable ${key} must be at least ${min}, got ${parsed}`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`Environment variable ${key} must be at most ${max}, got ${parsed}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export const config: Config = {
  qdrant: {
    url: getEnv('QDRANT_URL', 'http://localhost:6333'),
    collectionName: getEnv('QDRANT_COLLECTION', 'rag_documents'),
    vectorSize: getEnvNumber('VECTOR_SIZE', 1024, 64, 4096), // BGE-M3 dimension, reasonable bounds
  },
  litellm: {
    apiKey: getEnv('LITELLM_API_KEY'),
    baseUrl: getEnv('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
    embeddingModel: getEnv('EMBEDDING_MODEL', 'BAAI/bge-m3'),
    timeout: getEnvNumber('LITELLM_TIMEOUT', 30000, 1000, 300000), // 1s to 5min
  },
  sqlite: {
    path: getEnv('SQLITE_PATH', './data/sqlite/rag.db'),
  },
  chunking: {
    defaultSize: getEnvNumber('CHUNK_SIZE', 512, 50, 10000),
    defaultOverlap: getEnvNumber('CHUNK_OVERLAP', 50, 0, 1000),
    minChunkSize: getEnvNumber('MIN_CHUNK_SIZE', 100, 10, 1000),
  },
  search: {
    defaultLimit: getEnvNumber('SEARCH_LIMIT', 10, 1, 100),
    defaultThreshold: parseFloat(getEnv('SEARCH_THRESHOLD', '0.5')),
  },
  reranking: {
    enabled: getEnvBoolean('RERANKING_ENABLED', true),
    model: getEnv('RERANKER_MODEL', 'BAAI/bge-reranker-v2-m3'),
    topN: getEnvNumber('RERANK_TOP_N', 5, 1, 50),
    candidateMultiplier: getEnvNumber('RERANK_CANDIDATES', 4, 1, 20),
  },
  llm: {
    model: getEnv('LLM_MODEL', 'gpt-oss-120b'),
    queryExpansion: getEnvBoolean('QUERY_EXPANSION', true),
    autoSummary: getEnvBoolean('AUTO_SUMMARY', false),
    autoTags: getEnvBoolean('AUTO_TAGS', false),
    hyde: getEnvBoolean('HYDE_ENABLED', false),
  },
};

export default config;
