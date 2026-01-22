/**
 * Random Document Component
 * Shows a random document from the knowledge base (like Oracle's "wisdom" feature)
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw, Sparkles, ExternalLink } from 'lucide-react';
import { getRandomDocument } from '../../api/client';

interface RandomDocumentProps {
  onViewDocument?: (documentId: string) => void;
}

// File type display names and colors
const FILE_TYPE_INFO: Record<string, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: 'bg-red-100 text-red-700' },
  docx: { label: 'Word', color: 'bg-blue-100 text-blue-700' },
  pptx: { label: 'PowerPoint', color: 'bg-orange-100 text-orange-700' },
  xlsx: { label: 'Excel', color: 'bg-green-100 text-green-700' },
  md: { label: 'Markdown', color: 'bg-purple-100 text-purple-700' },
  txt: { label: 'Text', color: 'bg-gray-100 text-gray-700' },
  html: { label: 'HTML', color: 'bg-cyan-100 text-cyan-700' },
};

export default function RandomDocument({ onViewDocument }: RandomDocumentProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['random-document', refreshKey],
    queryFn: getRandomDocument,
    staleTime: 60000, // Keep for 1 minute
  });

  const doc = data?.data;
  const typeInfo = doc ? FILE_TYPE_INFO[doc.fileType] || { label: doc.fileType.toUpperCase(), color: 'bg-gray-100 text-gray-700' } : null;

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    refetch();
  };

  if (isLoading && !doc) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Document Spotlight</h3>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
          <div className="h-20 bg-gray-100 rounded mb-3" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Document Spotlight</h3>
          </div>
        </div>
        <div className="text-center py-6">
          <FileText className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="mt-2 text-sm text-gray-500">No documents available</p>
          <p className="text-xs text-gray-400 mt-1">Upload documents to see them here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-semibold text-gray-900">Document Spotlight</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefetching}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title="Show another document"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className={`relative ${isRefetching ? 'opacity-50' : ''}`}>
        {/* Document type badge */}
        {typeInfo && (
          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${typeInfo.color} mb-3`}>
            {typeInfo.label}
          </span>
        )}

        {/* Document title */}
        <h4 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
          {doc.filename}
        </h4>

        {/* Summary or placeholder */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          {doc.summary ? (
            <p className="text-sm text-gray-600 line-clamp-3">
              {doc.summary}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No summary available for this document.
            </p>
          )}
        </div>

        {/* Tags */}
        {doc.tags && doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {doc.tags.slice(0, 5).map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-primary-50 text-primary-700 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
            {doc.tags.length > 5 && (
              <span className="px-2 py-0.5 text-gray-400 text-xs">
                +{doc.tags.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{doc.chunkCount} chunks indexed</span>
          {onViewDocument && (
            <button
              onClick={() => onViewDocument(doc.id)}
              className="flex items-center text-primary-600 hover:text-primary-700 font-medium"
            >
              View details
              <ExternalLink className="w-3 h-3 ml-1" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
