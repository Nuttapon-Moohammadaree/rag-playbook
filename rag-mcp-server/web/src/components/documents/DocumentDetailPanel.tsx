/**
 * Document Detail Panel
 * Shows full document content with keyboard navigation
 * Inspired by Oracle v2's DocDetail page
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  ChevronLeft,
  ChevronRight,
  Tag,
  Layers,
  Calendar,
  HardDrive,
} from 'lucide-react';
import { clsx } from 'clsx';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  getDocumentContent,
  getDocumentNeighbors,
} from '../../api/client';

// File type display names and colors
const FILE_TYPE_INFO: Record<string, { label: string; color: string; bgColor: string }> = {
  pdf: { label: 'PDF', color: 'text-red-700', bgColor: 'bg-red-100' },
  docx: { label: 'Word', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  pptx: { label: 'PowerPoint', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  xlsx: { label: 'Excel', color: 'text-green-700', bgColor: 'bg-green-100' },
  md: { label: 'Markdown', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  txt: { label: 'Text', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  html: { label: 'HTML', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  csv: { label: 'CSV', color: 'text-lime-700', bgColor: 'bg-lime-100' },
  json: { label: 'JSON', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
};

interface DocumentDetailPanelProps {
  documentId: string;
  onClose: () => void;
  onNavigate?: (documentId: string) => void;
}

export default function DocumentDetailPanel({
  documentId,
  onClose,
  onNavigate,
}: DocumentDetailPanelProps) {
  const [showKeyboardHint, setShowKeyboardHint] = useState(true);

  // Fetch document content
  const {
    data: contentData,
    isLoading: contentLoading,
    error: contentError,
  } = useQuery({
    queryKey: ['document-content', documentId],
    queryFn: () => getDocumentContent(documentId),
  });

  // Fetch neighbors for navigation
  const { data: neighborsData } = useQuery({
    queryKey: ['document-neighbors', documentId],
    queryFn: () => getDocumentNeighbors(documentId),
  });

  const doc = contentData?.data;
  const neighbors = neighborsData?.data;

  // Navigate to a document
  const goToDocument = useCallback(
    (targetId: string) => {
      if (onNavigate) {
        onNavigate(targetId);
      }
    },
    [onNavigate]
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case 'j':
          // Next document
          if (neighbors?.next) {
            goToDocument(neighbors.next.id);
          }
          break;
        case 'k':
          // Previous document
          if (neighbors?.prev) {
            goToDocument(neighbors.prev.id);
          }
          break;
        case 'u':
        case 'Escape':
          // Go back
          onClose();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [neighbors, goToDocument, onClose]);

  // Auto-hide keyboard hint after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowKeyboardHint(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get file type info
  const typeInfo = doc
    ? FILE_TYPE_INFO[doc.fileType] || {
        label: doc.fileType.toUpperCase(),
        color: 'text-gray-700',
        bgColor: 'bg-gray-100',
      }
    : null;

  if (contentLoading) {
    return (
      <div className="space-y-6">
        {/* Back button skeleton */}
        <div className="h-10 w-32 bg-gray-200 animate-pulse rounded" />

        {/* Header skeleton */}
        <div className="space-y-4">
          <div className="h-6 w-20 bg-gray-200 animate-pulse rounded-full" />
          <div className="h-8 w-3/4 bg-gray-200 animate-pulse rounded" />
          <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded" />
        </div>

        {/* Content skeleton */}
        <div className="card p-6 space-y-4">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-gray-100 animate-pulse rounded"
              style={{ width: `${Math.random() * 40 + 60}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (contentError || !doc) {
    return (
      <div className="space-y-6">
        <button
          onClick={onClose}
          className="flex items-center text-gray-600 hover:text-gray-900 font-medium"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Documents
        </button>

        <div className="card p-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-4 text-gray-600">Document not found</p>
          <p className="mt-1 text-sm text-gray-400">
            The document may have been deleted or moved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Keyboard hint banner */}
      {showKeyboardHint && (
        <div className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center justify-between text-sm">
          <span>
            Keyboard shortcuts: <kbd className="kbd">J</kbd> next &middot;{' '}
            <kbd className="kbd">K</kbd> prev &middot;{' '}
            <kbd className="kbd">U</kbd> back
          </span>
          <button
            onClick={() => setShowKeyboardHint(false)}
            className="text-slate-400 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Documents
      </button>

      {/* Document header */}
      <header className="space-y-4">
        {/* Type badge */}
        {typeInfo && (
          <span
            className={clsx(
              'inline-flex items-center px-3 py-1 text-sm font-medium rounded-full',
              typeInfo.bgColor,
              typeInfo.color
            )}
          >
            {typeInfo.label}
          </span>
        )}

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900">{doc.filename}</h1>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-1.5" />
            {formatDate(doc.createdAt)}
          </div>
          <div className="flex items-center">
            <Layers className="w-4 h-4 mr-1.5" />
            {doc.chunkCount} chunks
          </div>
          <div className="flex items-center">
            <HardDrive className="w-4 h-4 mr-1.5" />
            {formatFileSize(doc.fileSize)}
          </div>
          {neighbors && (
            <div className="text-gray-400">
              Document {neighbors.current.index + 1} of {neighbors.total}
            </div>
          )}
        </div>
      </header>

      {/* Summary */}
      {doc.summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-blue-800 mb-2">Summary</h2>
          <p className="text-blue-700">{doc.summary}</p>
        </div>
      )}

      {/* Tags */}
      {doc.tags && doc.tags.length > 0 && (
        <div className="flex items-start gap-2">
          <Tag className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
          <div className="flex flex-wrap gap-2">
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-primary-50 text-primary-700 text-sm rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Document content */}
      <article className="card">
        <div className="p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Document Content</h2>
        </div>
        <div className="p-6 prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-primary-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-900">
          <Markdown remarkPlugins={[remarkGfm]}>{doc.fullContent}</Markdown>
        </div>
      </article>

      {/* Navigation */}
      {neighbors && (neighbors.prev || neighbors.next) && (
        <nav className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
          <button
            onClick={() => neighbors.prev && goToDocument(neighbors.prev.id)}
            disabled={!neighbors.prev}
            className={clsx(
              'flex items-center px-4 py-2 rounded-lg font-medium transition-colors',
              neighbors.prev
                ? 'text-gray-700 hover:bg-gray-200'
                : 'text-gray-300 cursor-not-allowed'
            )}
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            <span className="hidden sm:inline">Previous</span>
            <kbd className="kbd ml-2">K</kbd>
          </button>

          <div className="text-sm text-gray-500">
            <kbd className="kbd">J</kbd>/<kbd className="kbd">K</kbd> navigate
            &middot; <kbd className="kbd">U</kbd> back
          </div>

          <button
            onClick={() => neighbors.next && goToDocument(neighbors.next.id)}
            disabled={!neighbors.next}
            className={clsx(
              'flex items-center px-4 py-2 rounded-lg font-medium transition-colors',
              neighbors.next
                ? 'text-gray-700 hover:bg-gray-200'
                : 'text-gray-300 cursor-not-allowed'
            )}
          >
            <span className="hidden sm:inline">Next</span>
            <kbd className="kbd mr-2 sm:ml-2">J</kbd>
            <ChevronRight className="w-5 h-5 ml-1" />
          </button>
        </nav>
      )}

      {/* Source file info */}
      <footer className="text-sm text-gray-400 flex items-center">
        <FileText className="w-4 h-4 mr-2" />
        <span className="truncate" title={doc.filepath}>
          Source: {doc.filepath}
        </span>
      </footer>

      {/* Keyboard shortcut styles */}
      <style>{`
        .kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.5rem;
          height: 1.5rem;
          padding: 0 0.375rem;
          font-size: 0.75rem;
          font-family: ui-monospace, SFMono-Regular, monospace;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 0.25rem;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        .bg-slate-800 .kbd {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
