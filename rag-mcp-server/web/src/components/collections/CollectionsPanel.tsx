import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  FileText,
  ChevronRight,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  listCollections,
  createCollection,
  deleteCollection,
  updateCollection,
  getCollectionDocuments,
  type Collection,
  type Document,
} from '../../api/client';

const COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#3b82f6', // blue
];

interface CreateCollectionModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateCollectionModal({ onClose, onSuccess }: CreateCollectionModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined, color });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Create Collection</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              placeholder="My Collection"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full h-20 resize-none"
              placeholder="A brief description of this collection..."
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={clsx(
                    'w-8 h-8 rounded-full transition-all',
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CollectionDetailsProps {
  collection: Collection;
  onClose: () => void;
  onUpdate: () => void;
}

function CollectionDetails({ collection, onClose, onUpdate }: CollectionDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description || '');

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['collection-documents', collection.id],
    queryFn: () => getCollectionDocuments(collection.id),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      updateCollection(collection.id, data),
    onSuccess: () => {
      setIsEditing(false);
      onUpdate();
    },
  });

  const documents = docsData?.data?.documents || [];

  const handleSave = () => {
    updateMutation.mutate({
      name: name !== collection.name ? name : undefined,
      description: description !== collection.description ? description : undefined,
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: collection.color }}
            />
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input text-lg font-semibold"
              />
            ) : (
              <h3 className="text-lg font-semibold text-gray-900">{collection.name}</h3>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {isEditing ? (
              <>
                <button onClick={() => setIsEditing(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="btn-primary text-sm"
                  disabled={updateMutation.isPending}
                >
                  Save
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          {isEditing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full h-20 resize-none mb-4"
              placeholder="Description..."
            />
          ) : collection.description ? (
            <p className="text-gray-600 text-sm mb-4">{collection.description}</p>
          ) : null}

          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-gray-900">
              Documents ({documents.length})
            </h4>
          </div>

          {docsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">No documents in this collection</p>
              <p className="text-xs text-gray-400 mt-1">
                Add documents from the Documents tab
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: Document) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center min-w-0">
                    <FileText className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.filename}
                      </p>
                      <p className="text-xs text-gray-500">
                        {doc.chunkCount} chunks · {formatFileSize(doc.fileSize)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'px-2 py-0.5 text-xs rounded-full ml-2',
                      doc.status === 'indexed' && 'bg-green-100 text-green-700',
                      doc.status === 'processing' && 'bg-yellow-100 text-yellow-700',
                      doc.status === 'pending' && 'bg-blue-100 text-blue-700',
                      doc.status === 'failed' && 'bg-red-100 text-red-700'
                    )}
                  >
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 text-xs text-gray-500">
          Created {new Date(collection.createdAt).toLocaleDateString()} · Updated{' '}
          {new Date(collection.updatedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

export default function CollectionsPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['collections'],
    queryFn: listCollections,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const collections = data?.data?.collections || [];

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? Documents will be unassigned but not deleted.`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['collections'] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Collections</h2>
          <p className="text-sm text-gray-500">Organize documents into collections</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleRefresh} className="btn-secondary" disabled={isLoading}>
            <RefreshCw className={clsx('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Collection
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 bg-red-50 border-red-200">
          <p className="text-red-700">Failed to load collections. Please try again.</p>
        </div>
      )}

      {/* Collections Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 h-40 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="card p-8 text-center">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No collections yet</h3>
          <p className="mt-2 text-gray-500">
            Create your first collection to organize documents.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            <Plus className="w-4 h-4 mr-2" />
            Create Collection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection: Collection) => (
            <div
              key={collection.id}
              className="card p-6 hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => setSelectedCollection(collection)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${collection.color}20` }}
                  >
                    <FolderOpen className="w-5 h-5" style={{ color: collection.color }} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{collection.name}</h3>
                    <p className="text-sm text-gray-500">
                      {collection.documentCount} documents
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(collection.id, collection.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-all"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {collection.description && (
                <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                  {collection.description}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Updated {new Date(collection.updatedAt).toLocaleDateString()}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateCollectionModal
          onClose={() => setShowCreate(false)}
          onSuccess={handleRefresh}
        />
      )}

      {/* Details Modal */}
      {selectedCollection && (
        <CollectionDetails
          collection={selectedCollection}
          onClose={() => setSelectedCollection(null)}
          onUpdate={() => {
            handleRefresh();
            setSelectedCollection(null);
          }}
        />
      )}
    </div>
  );
}
