import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, FileText, RefreshCw, Settings2 } from 'lucide-react';
import { clsx } from 'clsx';
import { searchDocuments, type SearchResult } from '../../api/client';
import { SearchResultSkeleton } from '../ui/Skeleton';

export default function SearchInterface() {
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState({
    limit: 10,
    threshold: 0.5,
    rerank: true,
  });

  const searchMutation = useMutation({
    mutationFn: searchDocuments,
  });

  const results = searchMutation.data?.data?.results || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchMutation.mutate({
      query: query.trim(),
      ...options,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="card p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex space-x-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your documents..."
                className="input pl-10"
              />
            </div>
            <button
              type="submit"
              disabled={searchMutation.isPending || !query.trim()}
              className="btn-primary"
            >
              {searchMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={clsx(
                'btn-secondary',
                showAdvanced && 'bg-gray-100'
              )}
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Results Limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={options.limit}
                  onChange={(e) => setOptions({ ...options, limit: parseInt(e.target.value) || 10 })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Score Threshold
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={options.threshold}
                  onChange={(e) => setOptions({ ...options, threshold: parseFloat(e.target.value) || 0.5 })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reranking
                </label>
                <label className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    checked={options.rerank}
                    onChange={(e) => setOptions({ ...options, rerank: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Enable cross-encoder reranking</span>
                </label>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Error State */}
      {searchMutation.error && (
        <div className="card p-4 bg-red-50 border-red-200">
          <p className="text-red-700">Search failed. Please try again.</p>
        </div>
      )}

      {/* Loading State */}
      {searchMutation.isPending && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Searching...
            </h3>
          </div>
          <SearchResultSkeleton />
        </div>
      )}

      {/* Results */}
      {searchMutation.isSuccess && !searchMutation.isPending && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Results
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({results.length} found)
              </span>
            </h3>
          </div>

          {results.length === 0 ? (
            <div className="card p-8 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No results found</h3>
              <p className="mt-2 text-gray-500">Try a different search query or lower the threshold.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result: SearchResult, index: number) => (
                <div key={result.chunkId} className="card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                        {index + 1}
                      </span>
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{result.document.filename}</span>
                      </div>
                    </div>
                    <span className={clsx('px-2 py-1 rounded text-sm font-medium', getScoreColor(result.score))}>
                      {(result.score * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="mt-3 pl-9">
                    <p className="text-sm text-gray-600 line-clamp-3">
                      {result.content}
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      {result.document.filepath}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!searchMutation.isSuccess && !searchMutation.isPending && (
        <div className="card p-8 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Search your documents</h3>
          <p className="mt-2 text-gray-500">Enter a query above to search through indexed documents.</p>
        </div>
      )}
    </div>
  );
}
