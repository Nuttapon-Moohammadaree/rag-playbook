/**
 * Security utilities for RAG MCP Server
 * Provides path validation, error sanitization, and rate limiting
 */

import { resolve, normalize, isAbsolute } from 'path';
import { existsSync } from 'fs';

/**
 * Validate a file path to prevent directory traversal attacks
 * Returns the canonicalized absolute path if valid, throws if invalid
 */
export function validateFilePath(filepath: string, allowedBaseDirs?: string[]): string {
  if (!filepath || typeof filepath !== 'string') {
    throw new Error('Invalid file path: path must be a non-empty string');
  }

  // Normalize and resolve to absolute path
  const normalizedPath = normalize(filepath);
  const absolutePath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(process.cwd(), normalizedPath);

  // Check for path traversal patterns before resolution
  if (filepath.includes('\0')) {
    throw new Error('Invalid file path: null bytes not allowed');
  }

  // Ensure the resolved path doesn't escape allowed directories
  if (allowedBaseDirs && allowedBaseDirs.length > 0) {
    const isAllowed = allowedBaseDirs.some(baseDir => {
      const normalizedBase = resolve(baseDir);
      return absolutePath.startsWith(normalizedBase + '/') || absolutePath === normalizedBase;
    });

    if (!isAllowed) {
      throw new Error('Invalid file path: path is outside allowed directories');
    }
  }

  // Additional check: ensure the resolved path doesn't contain traversal after resolution
  const resolvedNormalized = normalize(absolutePath);
  if (resolvedNormalized !== absolutePath) {
    throw new Error('Invalid file path: potential path traversal detected');
  }

  return absolutePath;
}

/**
 * Check if a path is safe (doesn't attempt directory traversal)
 */
export function isPathSafe(filepath: string): boolean {
  try {
    validateFilePath(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize error messages to prevent information disclosure
 * Removes sensitive information like file paths, API keys, and internal details
 */
export function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred';
  }

  const message = error.message;

  // Remove potential API key patterns
  let sanitized = message.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');

  // Remove potential bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');

  // Remove absolute file paths (Unix)
  sanitized = sanitized.replace(/\/(?:home|usr|var|tmp|etc|opt)\/[^\s:'"]+/g, '[REDACTED_PATH]');

  // Remove absolute file paths (Windows)
  sanitized = sanitized.replace(/[A-Z]:\\[^\s:'"]+/gi, '[REDACTED_PATH]');

  // Remove IP addresses with ports
  sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g, '[REDACTED_IP]');

  // Remove internal URLs that might leak infrastructure info
  sanitized = sanitized.replace(/https?:\/\/[a-zA-Z0-9.-]+\.(internal|local|corp|intranet)[^\s]*/gi, '[REDACTED_URL]');

  // Remove stack traces
  sanitized = sanitized.replace(/\n\s+at\s+.+/g, '');

  // Remove common error prefixes that might reveal internals
  sanitized = sanitized.replace(/^(Error|TypeError|ReferenceError|SyntaxError):\s*/i, '');

  // Truncate very long messages
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 497) + '...';
  }

  return sanitized || 'An error occurred while processing your request';
}

/**
 * Create a safe error response for MCP clients
 */
export function createSafeErrorResponse(error: unknown, context?: string): {
  success: false;
  error: string;
} {
  const sanitizedMessage = sanitizeError(error);
  const fullMessage = context
    ? `${context}: ${sanitizedMessage}`
    : sanitizedMessage;

  return {
    success: false,
    error: fullMessage,
  };
}

/**
 * Simple in-memory rate limiter
 * Returns true if request should be allowed, false if rate limited
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request should be allowed
   */
  isAllowed(key: string = 'global'): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests for this key
    const existing = this.requests.get(key) ?? [];

    // Filter to only requests within the window
    const recentRequests = existing.filter(time => time > windowStart);

    // Check if under limit
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return true;
  }

  /**
   * Get remaining requests in current window
   */
  getRemainingRequests(key: string = 'global'): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const existing = this.requests.get(key) ?? [];
    const recentRequests = existing.filter(time => time > windowStart);
    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  /**
   * Reset rate limiter for a key
   */
  reset(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }
}

// Global rate limiters for different operation types
export const searchRateLimiter = new RateLimiter(60, 60000);  // 60 searches per minute
export const askRateLimiter = new RateLimiter(30, 60000);     // 30 asks per minute
export const indexRateLimiter = new RateLimiter(20, 60000);   // 20 indexes per minute

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate document ID format (UUID)
 */
export function validateDocumentId(documentId: string): void {
  if (!isValidUUID(documentId)) {
    throw new Error('Invalid document ID format: must be a valid UUID');
  }
}

/**
 * Sanitize query input to prevent prompt injection (Unicode-aware)
 * Decodes Unicode escape sequences before checking patterns
 */
export function sanitizeQueryInput(query: string, maxLength: number = 500): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Decode Unicode escape sequences first
  let decoded = query;
  try {
    // Decode \uXXXX sequences
    decoded = decoded.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    // Decode &#xXXXX; HTML entities
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    // Decode &#NNNN; HTML entities
    decoded = decoded.replace(/&#(\d+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    );
  } catch {
    // If decoding fails, continue with original
  }

  // Trim and limit length
  let sanitized = decoded.trim().substring(0, maxLength);

  // Remove potential prompt injection patterns
  sanitized = sanitized
    .replace(/\bignore\s+(previous|above|all)\s+(instructions?|prompts?)\b/gi, '')
    .replace(/\b(system|assistant|user)\s*:/gi, '')
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\bforget\s+(everything|all|previous)\b/gi, '')
    .replace(/\bdo\s+not\s+follow\b/gi, '')
    .replace(/\bnew\s+instructions?\b/gi, '')
    .trim();

  return sanitized;
}

/**
 * Safe JSON parse with type validation using Zod-like schema
 */
export function safeJsonParse<T>(
  json: string,
  defaultValue: T,
  validator?: (value: unknown) => value is T
): T {
  try {
    const parsed = JSON.parse(json);
    if (validator && !validator(parsed)) {
      return defaultValue;
    }
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Document lock manager for preventing race conditions during concurrent indexing
 * Uses a Map to track which file paths are currently being processed
 */
export class DocumentLockManager {
  private locks: Map<string, { promise: Promise<void>; resolve: () => void }> = new Map();
  private waiters: Map<string, Array<{ resolve: () => void; reject: (err: Error) => void }>> = new Map();
  private readonly timeout: number;

  constructor(timeoutMs: number = 300000) {
    this.timeout = timeoutMs;
  }

  /**
   * Acquire a lock for a filepath. Returns a release function.
   * If the lock is already held, waits until it's released or timeout occurs.
   */
  async acquire(filepath: string): Promise<() => void> {
    const normalizedPath = filepath.toLowerCase();

    // If lock exists, wait for it
    while (this.locks.has(normalizedPath)) {
      await this.waitForLock(normalizedPath);
    }

    // Create new lock
    let releaseResolve: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });

    this.locks.set(normalizedPath, {
      promise: lockPromise,
      resolve: releaseResolve!,
    });

    // Set up automatic timeout
    const timeoutId = setTimeout(() => {
      this.release(normalizedPath);
      console.warn(`Document lock for ${normalizedPath} timed out after ${this.timeout}ms`);
    }, this.timeout);

    // Return release function
    return () => {
      clearTimeout(timeoutId);
      this.release(normalizedPath);
    };
  }

  /**
   * Try to acquire a lock without waiting
   * Returns release function if successful, null if lock already held
   */
  tryAcquire(filepath: string): (() => void) | null {
    const normalizedPath = filepath.toLowerCase();

    if (this.locks.has(normalizedPath)) {
      return null;
    }

    // Create new lock synchronously
    let releaseResolve: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });

    this.locks.set(normalizedPath, {
      promise: lockPromise,
      resolve: releaseResolve!,
    });

    const timeoutId = setTimeout(() => {
      this.release(normalizedPath);
    }, this.timeout);

    return () => {
      clearTimeout(timeoutId);
      this.release(normalizedPath);
    };
  }

  /**
   * Check if a filepath is currently locked
   */
  isLocked(filepath: string): boolean {
    return this.locks.has(filepath.toLowerCase());
  }

  /**
   * Release a lock and notify waiters
   */
  private release(normalizedPath: string): void {
    const lock = this.locks.get(normalizedPath);
    if (lock) {
      this.locks.delete(normalizedPath);
      lock.resolve();

      // Notify all waiters
      const waiting = this.waiters.get(normalizedPath);
      if (waiting) {
        this.waiters.delete(normalizedPath);
        // Only notify first waiter to acquire lock
        const first = waiting.shift();
        if (first) {
          first.resolve();
        }
        // Re-queue others if any
        if (waiting.length > 0) {
          this.waiters.set(normalizedPath, waiting);
        }
      }
    }
  }

  /**
   * Wait for a lock to be released
   */
  private waitForLock(normalizedPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up timeout for waiting
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for document lock on ${normalizedPath}`));
      }, this.timeout);

      const waiter = {
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      };

      const existing = this.waiters.get(normalizedPath) ?? [];
      existing.push(waiter);
      this.waiters.set(normalizedPath, existing);
    });
  }

  /**
   * Get count of active locks (for monitoring)
   */
  getActiveLockCount(): number {
    return this.locks.size;
  }
}

// Global document lock manager
export const documentLockManager = new DocumentLockManager();

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Execute a function with exponential backoff retry logic
 * Useful for transient failures in external API calls (embedding, LLM, etc.)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'fetch failed', 'network', '429', '502', '503', '504'],
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // Check if error is retryable
      const errorMessage = lastError.message.toLowerCase();
      const isRetryable = retryableErrors.some(
        errPattern => errorMessage.includes(errPattern.toLowerCase())
      );

      if (!isRetryable) {
        throw lastError;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff + jitter
      const jitter = Math.random() * 0.3 * delay; // 0-30% jitter
      delay = Math.min(delay * backoffMultiplier + jitter, maxDelayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Unknown error during retry');
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
