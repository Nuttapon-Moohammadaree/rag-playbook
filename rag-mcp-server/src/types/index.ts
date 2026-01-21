/**
 * Core type definitions for RAG MCP Server
 */

// Document types
export interface Document {
  id: string;
  filename: string;
  filepath: string;
  fileType: FileType;
  fileSize: number;
  mimeType: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
  indexedAt: Date | null;
  status: DocumentStatus;
  chunkCount: number;
  metadata: DocumentMetadata;
  summary?: string;
  tags?: string[];
  collectionId?: string;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  description?: string;
  tags?: string[];
  category?: string;
  source?: string;
  [key: string]: unknown;
}

export type FileType = 'txt' | 'md' | 'docx' | 'pdf' | 'pptx' | 'xlsx' | 'csv' | 'html' | 'json' | 'rtf';
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed';

// Chunk types
export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  embedding?: number[];
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  pageNumber?: number;
  sectionTitle?: string;
  slideNumber?: number;
  sheetName?: string;
  headings?: string[];
  [key: string]: unknown;
}

// Embedding types
export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// Search types
export interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: SearchFilters;
  rerank?: boolean;
  expand?: boolean;
  hyde?: boolean;
}

// Reranking types
export interface RerankRequest {
  query: string;
  documents: string[];
  topN?: number;
}

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

export interface SearchFilters {
  documentIds?: string[];
  fileTypes?: FileType[];
  dateFrom?: Date;
  dateTo?: Date;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  document: DocumentSummary;
  metadata: ChunkMetadata;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  filepath: string;
  fileType: FileType;
}

// Parser types
export interface ParsedDocument {
  content: string;
  metadata: DocumentMetadata;
  sections?: ParsedSection[];
}

export interface ParsedSection {
  title?: string;
  content: string;
  pageNumber?: number;
  slideNumber?: number;
}

// Ingestion types
export interface IngestionResult {
  documentId: string;
  filename: string;
  status: 'success' | 'failed';
  chunkCount: number;
  error?: string;
}

export interface IngestionOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  forceReindex?: boolean;
}

// MCP Tool types
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Config types
export interface Config {
  qdrant: {
    url: string;
    collectionName: string;
    vectorSize: number;
  };
  litellm: {
    apiKey: string;
    baseUrl: string;
    embeddingModel: string;
    timeout: number;
  };
  sqlite: {
    path: string;
  };
  chunking: {
    defaultSize: number;
    defaultOverlap: number;
    minChunkSize: number;
  };
  search: {
    defaultLimit: number;
    defaultThreshold: number;
  };
  reranking: {
    enabled: boolean;
    model: string;
    topN: number;
    candidateMultiplier: number;
  };
  llm: {
    model: string;
    queryExpansion: boolean;
    autoSummary: boolean;
    autoTags: boolean;
    hyde: boolean;
  };
  verification: {
    enabled: boolean;
    relevanceThreshold: number;
    groundingThreshold: number;
    maxParallelCalls: number;
    cacheResults: boolean;
    cacheTtlMs: number;
  };
}
