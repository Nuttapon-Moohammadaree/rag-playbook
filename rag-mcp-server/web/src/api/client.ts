/**
 * API Client for RAG MCP Server
 */

const API_BASE = '/api';

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: ApiError;
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

/**
 * Extract error message from various response formats
 */
function extractErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Try common error field names
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.detail === 'string') return obj.detail;
    // Zod validation errors
    if (Array.isArray(obj.errors)) {
      const messages = obj.errors
        .map((e: unknown) => {
          if (typeof e === 'object' && e !== null) {
            const err = e as Record<string, unknown>;
            return err.message || err.path?.toString();
          }
          return String(e);
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join(', ');
    }
    // Nested error object
    if (typeof obj.error === 'object' && obj.error !== null) {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === 'string') return nested.message;
    }
  }

  // Fallback to status code messages
  switch (statusCode) {
    case 400: return 'Invalid request. Please check your input.';
    case 401: return 'Authentication required. Please log in.';
    case 403: return 'Access denied. You do not have permission.';
    case 404: return 'Resource not found.';
    case 422: return 'Validation error. Please check your input.';
    case 429: return 'Too many requests. Please try again later.';
    case 500: return 'Server error. Please try again later.';
    case 502: return 'Service temporarily unavailable.';
    case 503: return 'Service unavailable. Please try again later.';
    default: return `Request failed with status ${statusCode}`;
  }
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

    let data: unknown;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { error: text || 'Unknown error' };
    }

    if (!response.ok) {
      const errorMessage = extractErrorMessage(data, response.status);
      return {
        success: false,
        error: errorMessage,
        errorDetails: {
          message: errorMessage,
          statusCode: response.status,
          details: typeof data === 'object' ? data as Record<string, unknown> : undefined,
        },
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    // Handle network errors
    let errorMessage = 'Network error. Please check your connection.';

    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      errorMessage = 'Unable to connect to server. Please check if the server is running.';
    } else if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Request was cancelled.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
      errorDetails: {
        message: errorMessage,
        code: 'NETWORK_ERROR',
      },
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

// Collection types
export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

// Collection APIs
export async function listCollections() {
  return fetchApi<{
    collections: Collection[];
    total: number;
  }>('/collections');
}

export async function createCollection(data: {
  name: string;
  description?: string;
  color?: string;
}) {
  return fetchApi<Collection>('/collections', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCollection(id: string, data: {
  name?: string;
  description?: string;
  color?: string;
}) {
  return fetchApi<Collection>(`/collections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCollection(id: string) {
  return fetchApi<{ collectionId: string; message: string }>(`/collections/${id}`, {
    method: 'DELETE',
  });
}

export async function getCollectionDocuments(id: string) {
  return fetchApi<{
    collection: Collection;
    documents: Document[];
    total: number;
  }>(`/collections/${id}/documents`);
}

export async function addDocumentToCollection(collectionId: string, documentId: string) {
  return fetchApi<{ collectionId: string; documentId: string; message: string }>(
    `/collections/${collectionId}/documents`,
    {
      method: 'POST',
      body: JSON.stringify({ documentId }),
    }
  );
}

export async function removeDocumentFromCollection(collectionId: string, documentId: string) {
  return fetchApi<{ collectionId: string; documentId: string; message: string }>(
    `/collections/${collectionId}/documents/${documentId}`,
    {
      method: 'DELETE',
    }
  );
}

// Analytics types
export interface QueryStats {
  totalQueries: number;
  searchQueries: number;
  askQueries: number;
  avgLatencyMs: number;
  avgResultCount: number;
  queriesLast24h: number;
  queriesLast7d: number;
}

export interface QueryTrend {
  date: string;
  searchCount: number;
  askCount: number;
  totalCount: number;
}

export interface TopQuery {
  query: string;
  count: number;
  avgLatencyMs: number;
  lastUsed: string;
}

export interface QueryLogEntry {
  id: number;
  query: string;
  queryType: 'search' | 'ask';
  source: string;
  resultCount: number;
  topScore: number | null;
  latencyMs: number | null;
  createdAt: string;
}

// Analytics APIs
export async function getAnalyticsStats() {
  return fetchApi<QueryStats>('/analytics/stats');
}

export async function getQueryTrends(days: number = 7) {
  return fetchApi<{
    trends: QueryTrend[];
    period: { days: number; start: string; end: string };
  }>(`/analytics/trends?days=${days}`);
}

export async function getTopQueries(limit: number = 10, type?: 'search' | 'ask') {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.set('type', type);
  return fetchApi<{
    queries: TopQuery[];
    total: number;
  }>(`/analytics/top-queries?${params.toString()}`);
}

export async function getRecentQueries(limit: number = 100, type?: 'search' | 'ask') {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.set('type', type);
  return fetchApi<{
    queries: QueryLogEntry[];
    total: number;
  }>(`/analytics/queries?${params.toString()}`);
}
