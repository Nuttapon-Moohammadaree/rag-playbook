/**
 * API Client for RAG MCP Server
 */

const API_BASE = '/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Document {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'indexed' | 'failed';
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  document: {
    id: string;
    filename: string;
    filepath: string;
    fileType: string;
  };
}

export interface AskResponse {
  answer: string;
  sources: Array<{
    filename: string;
    filepath: string;
    content: string;
    score: number;
  }>;
  model: string;
  verification?: {
    enabled: boolean;
    groundingScore: number;
    isGrounded: boolean;
    unsupportedClaims: string[];
    citations: Array<{
      chunkId: string;
      filename: string;
      quote: string;
      relevanceScore: number;
    }>;
    chunksFiltered: number;
    verificationTimeMs: number;
  };
  confidence?: number;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Request failed',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Document APIs
export async function uploadDocument(
  filepath: string,
  options?: { chunkSize?: number; chunkOverlap?: number }
) {
  return fetchApi<{ documentId: string; status: string }>('/documents/upload', {
    method: 'POST',
    body: JSON.stringify({ filepath, ...options }),
  });
}

export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.status) query.set('status', params.status);

  const queryString = query.toString();
  return fetchApi<{
    documents: Document[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }>(`/documents${queryString ? `?${queryString}` : ''}`);
}

export async function getDocument(id: string) {
  return fetchApi<Document>(`/documents/${id}`);
}

export async function deleteDocument(id: string) {
  return fetchApi<{ documentId: string; message: string }>(`/documents/${id}`, {
    method: 'DELETE',
  });
}

// Search API
export async function searchDocuments(params: {
  query: string;
  limit?: number;
  threshold?: number;
  rerank?: boolean;
}) {
  return fetchApi<{
    results: SearchResult[];
    metadata: {
      query: string;
      totalResults: number;
    };
  }>('/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Ask API
export async function askQuestion(params: {
  question: string;
  limit?: number;
  threshold?: number;
  rerank?: boolean;
  verify?: boolean;
}) {
  return fetchApi<AskResponse>('/ask', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Health check
export async function checkHealth() {
  return fetchApi<{
    status: string;
    timestamp: string;
    version: string;
  }>('/health');
}
