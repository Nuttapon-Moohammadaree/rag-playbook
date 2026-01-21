import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Settings,
  Server,
  Database,
  Cpu,
  Search,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { checkHealth } from '../../api/client';

interface SettingRowProps {
  label: string;
  value: string | number | boolean;
  description?: string;
}

function SettingRow({ label, value, description }: SettingRowProps) {
  const displayValue = typeof value === 'boolean'
    ? (value ? 'Enabled' : 'Disabled')
    : String(value);

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <span className={clsx(
        'px-3 py-1 text-sm rounded-lg',
        typeof value === 'boolean'
          ? value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          : 'bg-gray-100 text-gray-700 font-mono'
      )}>
        {displayValue}
      </span>
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function SettingsSection({ title, icon: Icon, children }: SettingsSectionProps) {
  return (
    <div className="card">
      <div className="p-4 border-b border-gray-200 flex items-center space-x-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Icon className="w-5 h-5 text-gray-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const [showEnvVars, setShowEnvVars] = useState(false);

  const { data: healthData, isLoading: healthLoading, refetch } = useQuery({
    queryKey: ['health-detailed'],
    queryFn: checkHealth,
    refetchInterval: 30000,
  });

  const isHealthy = healthData?.success;

  // These would typically come from an API endpoint
  // For now, showing common defaults with informative descriptions
  const settings = {
    server: {
      version: healthData?.data?.version || '1.0.0',
      apiPort: 3000,
      webPort: 8080,
    },
    embedding: {
      model: 'text-embedding-3-small',
      dimensions: 1536,
      batchSize: 100,
    },
    chunking: {
      defaultSize: 512,
      defaultOverlap: 50,
      minChunkSize: 100,
    },
    search: {
      defaultLimit: 10,
      defaultThreshold: 0.5,
      rerankEnabled: true,
      rerankModel: 'cohere-rerank-v3.5',
    },
    llm: {
      model: 'gpt-4o-mini',
      queryExpansion: true,
      hyde: true,
    },
    verification: {
      enabled: true,
      relevanceThreshold: 0.6,
      groundingThreshold: 0.7,
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500">System configuration and status</p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary"
          disabled={healthLoading}
        >
          <RefreshCw className={clsx('w-4 h-4 mr-2', healthLoading && 'animate-spin')} />
          Refresh Status
        </button>
      </div>

      {/* System Status */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {healthLoading ? (
              <div className="w-12 h-12 bg-gray-100 animate-pulse rounded-full" />
            ) : isHealthy ? (
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            ) : (
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                System Status: {healthLoading ? 'Checking...' : isHealthy ? 'Healthy' : 'Unhealthy'}
              </h3>
              <p className="text-sm text-gray-500">
                {healthData?.data?.timestamp
                  ? `Last checked: ${new Date(healthData.data.timestamp).toLocaleString()}`
                  : 'Unable to connect to server'}
              </p>
            </div>
          </div>
          <span className="text-sm text-gray-500">
            Version {settings.server.version}
          </span>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Settings */}
        <SettingsSection title="Server" icon={Server}>
          <SettingRow label="API Port" value={settings.server.apiPort} />
          <SettingRow label="Web UI Port" value={settings.server.webPort} />
          <SettingRow label="Version" value={settings.server.version} />
        </SettingsSection>

        {/* Embedding Settings */}
        <SettingsSection title="Embedding" icon={Database}>
          <SettingRow
            label="Model"
            value={settings.embedding.model}
            description="OpenAI embedding model"
          />
          <SettingRow label="Dimensions" value={settings.embedding.dimensions} />
          <SettingRow label="Batch Size" value={settings.embedding.batchSize} />
        </SettingsSection>

        {/* Chunking Settings */}
        <SettingsSection title="Chunking" icon={Cpu}>
          <SettingRow
            label="Default Size"
            value={`${settings.chunking.defaultSize} tokens`}
            description="Target chunk size"
          />
          <SettingRow
            label="Overlap"
            value={`${settings.chunking.defaultOverlap} tokens`}
            description="Overlap between chunks"
          />
          <SettingRow
            label="Min Size"
            value={`${settings.chunking.minChunkSize} tokens`}
            description="Minimum chunk size to keep"
          />
        </SettingsSection>

        {/* Search Settings */}
        <SettingsSection title="Search" icon={Search}>
          <SettingRow label="Default Limit" value={settings.search.defaultLimit} />
          <SettingRow label="Score Threshold" value={settings.search.defaultThreshold} />
          <SettingRow
            label="Reranking"
            value={settings.search.rerankEnabled}
            description={settings.search.rerankModel}
          />
        </SettingsSection>

        {/* LLM Settings */}
        <SettingsSection title="LLM" icon={MessageSquare}>
          <SettingRow
            label="Model"
            value={settings.llm.model}
            description="Model for answer generation"
          />
          <SettingRow
            label="Query Expansion"
            value={settings.llm.queryExpansion}
            description="Expand queries for better results"
          />
          <SettingRow
            label="HyDE"
            value={settings.llm.hyde}
            description="Hypothetical Document Embeddings"
          />
        </SettingsSection>

        {/* Verification Settings */}
        <SettingsSection title="Verification" icon={Settings}>
          <SettingRow
            label="Enabled"
            value={settings.verification.enabled}
            description="Verify answers against sources"
          />
          <SettingRow
            label="Relevance Threshold"
            value={settings.verification.relevanceThreshold}
          />
          <SettingRow
            label="Grounding Threshold"
            value={settings.verification.groundingThreshold}
          />
        </SettingsSection>
      </div>

      {/* Environment Variables (Collapsible) */}
      <div className="card">
        <button
          onClick={() => setShowEnvVars(!showEnvVars)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Settings className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Environment Configuration</h3>
              <p className="text-sm text-gray-500">View configuration via environment variables</p>
            </div>
          </div>
          <span className="text-sm text-primary-600">
            {showEnvVars ? 'Hide' : 'Show'}
          </span>
        </button>

        {showEnvVars && (
          <div className="p-4 border-t bg-gray-50">
            <p className="text-sm text-gray-600 mb-4">
              Configure the server using these environment variables in your <code className="bg-gray-200 px-1 rounded">.env</code> file:
            </p>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <pre>{`# LiteLLM Configuration
LITELLM_API_KEY=your-api-key
LITELLM_BASE_URL=http://litellm:4000

# Embedding Model
EMBEDDING_MODEL=openai/text-embedding-3-small

# LLM Model
LLM_MODEL=openai/gpt-4o-mini

# Storage
QDRANT_URL=http://qdrant:6333
SQLITE_PATH=./data/rag.db

# Features
RERANK_ENABLED=true
VERIFICATION_ENABLED=true
QUERY_EXPANSION_ENABLED=true
HYDE_ENABLED=true`}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Documentation Link */}
      <div className="card p-4 bg-primary-50 border-primary-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <ExternalLink className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary-900">Documentation</h3>
              <p className="text-xs text-primary-700">
                Learn more about configuration options
              </p>
            </div>
          </div>
          <a
            href="/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View API Docs
          </a>
        </div>
      </div>
    </div>
  );
}
