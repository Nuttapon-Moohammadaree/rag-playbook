import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  MessageSquare,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  Activity,
  HardDrive,
  Layers,
  Network,
} from 'lucide-react';
import { clsx } from 'clsx';
import { listDocuments, checkHealth, type Document } from '../../api/client';
import RandomDocument from './RandomDocument';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
}

function StatCard({ title, value, icon: Icon, loading }: StatCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {loading ? (
            <div className="h-8 w-16 bg-gray-200 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          )}
        </div>
        <div className="p-3 bg-primary-50 rounded-lg">
          <Icon className="w-6 h-6 text-primary-600" />
        </div>
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: 'healthy' | 'degraded' | 'down' | 'loading';
}

function StatusBadge({ status }: StatusBadgeProps) {
  const configs = {
    healthy: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Healthy' },
    degraded: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, text: 'Degraded' },
    down: { color: 'bg-red-100 text-red-800', icon: AlertCircle, text: 'Down' },
    loading: { color: 'bg-gray-100 text-gray-800', icon: Clock, text: 'Checking...' },
  };

  const config = configs[status];
  const Icon = config.icon;

  return (
    <span className={clsx('inline-flex items-center px-3 py-1 rounded-full text-sm font-medium', config.color)}>
      <Icon className="w-4 h-4 mr-1.5" />
      {config.text}
    </span>
  );
}

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
}

function QuickAction({ title, description, icon: Icon, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-start p-4 bg-white border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all text-left w-full"
    >
      <div className="p-2 bg-primary-50 rounded-lg mr-4">
        <Icon className="w-5 h-5 text-primary-600" />
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

interface DashboardPanelProps {
  onNavigate?: (tab: string) => void;
}

export default function DashboardPanel({ onNavigate }: DashboardPanelProps) {
  // Fetch documents for stats
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => listDocuments({ limit: 100 }),
  });

  // Fetch health status
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const documents = docsData?.data?.documents || [];

  // Calculate statistics
  const stats = {
    totalDocuments: documents.length,
    totalChunks: documents.reduce((sum: number, doc: Document) => sum + doc.chunkCount, 0),
    indexed: documents.filter((d: Document) => d.status === 'indexed').length,
    pending: documents.filter((d: Document) => d.status === 'pending').length,
    processing: documents.filter((d: Document) => d.status === 'processing').length,
    failed: documents.filter((d: Document) => d.status === 'failed').length,
    totalSize: documents.reduce((sum: number, doc: Document) => sum + doc.fileSize, 0),
  };

  // Get document type breakdown
  const typeBreakdown = documents.reduce((acc: Record<string, number>, doc: Document) => {
    acc[doc.fileType] = (acc[doc.fileType] || 0) + 1;
    return acc;
  }, {});

  // Get recent documents (last 5)
  const recentDocuments = [...documents]
    .sort((a: Document, b: Document) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Determine system status
  const getSystemStatus = (): 'healthy' | 'degraded' | 'down' | 'loading' => {
    if (healthLoading) return 'loading';
    if (!healthData?.success) return 'down';
    if (stats.failed > 0) return 'degraded';
    return 'healthy';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handleNavigate = (tab: string) => {
    if (onNavigate) {
      onNavigate(tab);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with System Status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500">Overview of your RAG system</p>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">System Status:</span>
          <StatusBadge status={getSystemStatus()} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Documents"
          value={stats.totalDocuments}
          icon={FileText}
          loading={docsLoading}
        />
        <StatCard
          title="Indexed Chunks"
          value={stats.totalChunks}
          icon={Layers}
          loading={docsLoading}
        />
        <StatCard
          title="Storage Used"
          value={formatFileSize(stats.totalSize)}
          icon={HardDrive}
          loading={docsLoading}
        />
        <StatCard
          title="Success Rate"
          value={stats.totalDocuments > 0
            ? `${Math.round((stats.indexed / stats.totalDocuments) * 100)}%`
            : '0%'}
          icon={Activity}
          loading={docsLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Status Breakdown */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Document Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                <span className="text-sm text-gray-600">Indexed</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{stats.indexed}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
                <span className="text-sm text-gray-600">Processing</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{stats.processing}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
                <span className="text-sm text-gray-600">Pending</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{stats.pending}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                <span className="text-sm text-gray-600">Failed</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{stats.failed}</span>
            </div>
          </div>

          {/* File Type Breakdown */}
          {Object.keys(typeBreakdown).length > 0 && (
            <>
              <hr className="my-4" />
              <h4 className="text-sm font-medium text-gray-700 mb-3">By File Type</h4>
              <div className="space-y-2">
                {Object.entries(typeBreakdown).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 uppercase">{type}</span>
                    <span className="text-sm font-medium text-gray-900">{count as number}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent Documents */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Recent Documents</h3>
            <button
              onClick={() => handleNavigate('documents')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all
            </button>
          </div>

          {docsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : recentDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">No documents yet</p>
              <button
                onClick={() => handleNavigate('documents')}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Upload your first document
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDocuments.map((doc: Document) => (
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
                  <div className="flex items-center space-x-3 ml-4">
                    <span className={clsx(
                      'px-2 py-0.5 text-xs rounded-full',
                      doc.status === 'indexed' && 'bg-green-100 text-green-700',
                      doc.status === 'processing' && 'bg-yellow-100 text-yellow-700',
                      doc.status === 'pending' && 'bg-blue-100 text-blue-700',
                      doc.status === 'failed' && 'bg-red-100 text-red-700'
                    )}>
                      {doc.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(doc.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document Spotlight and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Random Document Spotlight */}
        <RandomDocument />

        {/* Quick Actions */}
        <div className="card p-6 lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickAction
              title="Upload"
              description="Add new documents"
              icon={Upload}
              onClick={() => handleNavigate('documents')}
            />
            <QuickAction
              title="Search"
              description="Semantic search"
              icon={Search}
              onClick={() => handleNavigate('search')}
            />
            <QuickAction
              title="Ask"
              description="AI-powered Q&A"
              icon={MessageSquare}
              onClick={() => handleNavigate('ask')}
            />
            <QuickAction
              title="Graph"
              description="Visualize knowledge"
              icon={Network}
              onClick={() => handleNavigate('graph')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
