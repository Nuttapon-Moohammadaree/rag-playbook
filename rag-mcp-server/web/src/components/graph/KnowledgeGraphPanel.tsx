/**
 * Knowledge Graph Panel
 * Provides both 2D and 3D visualization modes
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, Boxes, RefreshCw, Info } from 'lucide-react';
import { clsx } from 'clsx';
import Graph2D from './Graph2D';
import Graph3D from './Graph3D';
import { getGraph, listCollections, type GraphNode, type Collection } from '../../api/client';

type ViewMode = '2d' | '3d';

// File type legend
const FILE_TYPE_LEGEND = [
  { type: 'pdf', label: 'PDF', color: '#ef4444' },
  { type: 'docx', label: 'Word', color: '#3b82f6' },
  { type: 'pptx', label: 'PowerPoint', color: '#f97316' },
  { type: 'xlsx', label: 'Excel', color: '#22c55e' },
  { type: 'md', label: 'Markdown', color: '#8b5cf6' },
  { type: 'txt', label: 'Text', color: '#6b7280' },
];

interface DocumentDetailProps {
  node: GraphNode;
  onClose: () => void;
}

function DocumentDetail({ node, onClose }: DocumentDetailProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Document Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: node.color }}
              />
              <span className="text-xs uppercase text-gray-500">{node.type}</span>
            </div>
            <p className="text-gray-900 font-medium">{node.label}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Chunks</p>
              <p className="text-gray-900 font-medium">{node.chunkCount}</p>
            </div>
            <div>
              <p className="text-gray-500">Size</p>
              <p className="text-gray-900 font-medium">
                {node.fileSize < 1024 * 1024
                  ? `${(node.fileSize / 1024).toFixed(1)} KB`
                  : `${(node.fileSize / (1024 * 1024)).toFixed(1)} MB`}
              </p>
            </div>
          </div>

          {node.tags && node.tags.length > 0 && (
            <div>
              <p className="text-gray-500 text-sm mb-2">Tags</p>
              <div className="flex flex-wrap gap-1">
                {node.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeGraphPanel() {
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Fetch graph data
  const { data: graphData, isLoading: graphLoading, refetch: refetchGraph } = useQuery({
    queryKey: ['graph', selectedCollection],
    queryFn: () => getGraph({ collection: selectedCollection || undefined }),
  });

  // Fetch collections for filter
  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: listCollections,
  });

  const nodes = graphData?.data?.nodes || [];
  const links = graphData?.data?.links || [];
  const collections: Collection[] = collectionsData?.data?.collections || [];

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setShowDetail(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
  }, []);

  // Graph dimensions based on container
  const graphWidth = 900;
  const graphHeight = 600;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Knowledge Graph</h2>
          <p className="text-sm text-gray-500">
            Visualize relationships between documents
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Collection filter */}
          <select
            value={selectedCollection}
            onChange={e => setSelectedCollection(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Collections</option>
            {collections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('2d')}
              className={clsx(
                'flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === '2d'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Network className="w-4 h-4 mr-1.5" />
              2D
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={clsx(
                'flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === '3d'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Boxes className="w-4 h-4 mr-1.5" />
              3D
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => refetchGraph()}
            disabled={graphLoading}
            className="btn-secondary"
          >
            <RefreshCw className={clsx('w-4 h-4 mr-2', graphLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
        <div className="flex items-center space-x-6 text-sm">
          <span className="text-gray-600">
            <span className="font-medium text-gray-900">{nodes.length}</span> nodes
          </span>
          <span className="text-gray-600">
            <span className="font-medium text-gray-900">{links.length}</span> connections
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-4">
          {FILE_TYPE_LEGEND.map(item => (
            <div key={item.type} className="flex items-center space-x-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-gray-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph container */}
      <div className="card overflow-hidden">
        {graphLoading ? (
          <div className="h-[600px] flex items-center justify-center bg-slate-900">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 mt-3">Loading graph...</p>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="h-[600px] flex items-center justify-center bg-slate-900">
            <div className="text-center">
              <Network className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-400 mt-3">No documents to visualize</p>
              <p className="text-slate-500 text-sm mt-1">
                Upload and index documents to see the knowledge graph
              </p>
            </div>
          </div>
        ) : viewMode === '2d' ? (
          <Graph2D
            nodes={nodes}
            links={links}
            onNodeClick={handleNodeClick}
            width={graphWidth}
            height={graphHeight}
          />
        ) : (
          <Graph3D
            nodes={nodes}
            links={links}
            onNodeClick={handleNodeClick}
            width={graphWidth}
            height={graphHeight}
          />
        )}
      </div>

      {/* Info box */}
      <div className="flex items-start space-x-3 bg-blue-50 rounded-lg p-4">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">How connections work</p>
          <p className="mt-1 text-blue-700">
            Documents are connected based on: shared collections (strong), common tags (moderate),
            and same file type (weak). Click on any node to see document details.
          </p>
        </div>
      </div>

      {/* Document detail modal */}
      {showDetail && selectedNode && (
        <DocumentDetail node={selectedNode} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
