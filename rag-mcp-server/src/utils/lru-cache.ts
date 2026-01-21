/**
 * O(1) LRU Cache implementation using Map (which maintains insertion order)
 * and doubly-linked list semantics via Map deletion and re-insertion
 */

export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    if (maxSize < 1) {
      throw new Error('LRU cache maxSize must be at least 1');
    }
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache and mark it as recently used
   * Returns undefined if the key doesn't exist
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Move to end (most recently used) by deleting and re-inserting
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache
   * If cache is full, evicts the least recently used entry
   */
  set(key: K, value: V): void {
    // If key exists, delete it first (so it moves to end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Check if a key exists in the cache (doesn't update access order)
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get the maximum size of the cache
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Iterate over all entries (oldest to newest)
   */
  *entries(): IterableIterator<[K, V]> {
    yield* this.cache.entries();
  }

  /**
   * Get all keys (oldest to newest)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get all values (oldest to newest)
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }
}
