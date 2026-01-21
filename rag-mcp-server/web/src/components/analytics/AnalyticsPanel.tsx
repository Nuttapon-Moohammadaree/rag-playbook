import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Search,
  MessageSquare,
  Clock,
  TrendingUp,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  getAnalyticsStats,
  getQueryTrends,
  getTopQueries,
  getRecentQueries,
  type QueryStats,
  type QueryTrend,
  type TopQuery,
  type QueryLogEntry,
} from '../../api/client';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  loading?: boolean;
  color?: string;
}

function StatCard({ title, value, icon: Icon, subtitle, loading, color = 'primary' }: StatCardProps) {
  const colors: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {loading ? (
            <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1" />
          ) : (
            <>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
              {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
            </>
          )}
        </div>
        <div className={clsx('p-3 rounded-lg', colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

interface TrendChartProps {
  data: QueryTrend[];
  loading?: boolean;
}

function TrendChart({ data, loading }: TrendChartProps) {
  if (loading) {
    return <div className="h-48 bg-gray-100 animate-pulse rounded" />;
  }

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        No query data available yet
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.totalCount), 1);

  return (
    <div className="h-48 flex items-end space-x-2">
      {data.map((day, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div className="w-full flex flex-col-reverse gap-1 h-40">
            <div
              className="bg-blue-500 rounded-t transition-all"
              style={{ height: `${(day.searchCount / maxCount) * 100}%` }}
              title={`Search: ${day.searchCount}`}
            />
            <div
              className="bg-purple-500 rounded-t transition-all"
              style={{ height: `${(day.askCount / maxCount) * 100}%` }}
              title={`Ask: ${day.askCount}`}
            />
          </div>
          <span className="text-xs text-gray-400 mt-2">
            {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPanel() {
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['analytics-stats'],
    queryFn: getAnalyticsStats,
  });

  const { data: trendsData, isLoading: trendsLoading, refetch: refetchTrends } = useQuery({
    queryKey: ['analytics-trends'],
    queryFn: () => getQueryTrends(7),
  });

  const { data: topData, isLoading: topLoading, refetch: refetchTop } = useQuery({
    queryKey: ['analytics-top'],
    queryFn: () => getTopQueries(10),
  });

  const { data: recentData, isLoading: recentLoading, refetch: refetchRecent } = useQuery({
    queryKey: ['analytics-recent'],
    queryFn: () => getRecentQueries(20),
  });

  const stats: QueryStats = statsData?.data || {
    totalQueries: 0,
    searchQueries: 0,
    askQueries: 0,
    avgLatencyMs: 0,
    avgResultCount: 0,
    queriesLast24h: 0,
    queriesLast7d: 0,
  };

  const trends: QueryTrend[] = trendsData?.data?.trends || [];
  const topQueries: TopQuery[] = topData?.data?.queries || [];
  const recentQueries: QueryLogEntry[] = recentData?.data?.queries || [];

  const handleRefresh = () => {
    refetchStats();
    refetchTrends();
    refetchTop();
    refetchRecent();
  };

  const isLoading = statsLoading || trendsLoading;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-500">Query patterns and performance metrics</p>
        </div>
        <button onClick={handleRefresh} className="btn-secondary" disabled={isLoading}>
          <RefreshCw className={clsx('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Queries"
          value={stats.totalQueries.toLocaleString()}
          icon={BarChart3}
          subtitle={`${stats.queriesLast24h} in last 24h`}
          loading={statsLoading}
        />
        <StatCard
          title="Search Queries"
          value={stats.searchQueries.toLocaleString()}
          icon={Search}
          color="blue"
          loading={statsLoading}
        />
        <StatCard
          title="Ask Queries"
          value={stats.askQueries.toLocaleString()}
          icon={MessageSquare}
          color="purple"
          loading={statsLoading}
        />
        <StatCard
          title="Avg Latency"
          value={`${stats.avgLatencyMs}ms`}
          icon={Clock}
          subtitle={`Avg ${stats.avgResultCount} results`}
          color="green"
          loading={statsLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Query Trends */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Query Trends (7 days)</h3>
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-1.5" />
                <span className="text-gray-600">Search</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-purple-500 mr-1.5" />
                <span className="text-gray-600">Ask</span>
              </div>
            </div>
          </div>
          <TrendChart data={trends} loading={trendsLoading} />
        </div>

        {/* Top Queries */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Top Queries</h3>
          {topLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : topQueries.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">No queries yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topQueries.slice(0, 5).map((q, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate" title={q.query}>
                      {q.query}
                    </p>
                    <p className="text-xs text-gray-500">
                      {q.avgLatencyMs}ms avg
                    </p>
                  </div>
                  <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                    {q.count}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Queries */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Recent Queries</h3>
        </div>
        {recentLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
            ))}
          </div>
        ) : recentQueries.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">No recent queries</p>
            <p className="text-xs text-gray-400 mt-1">
              Queries will appear here when you search or ask questions
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentQueries.map((query) => (
              <div key={query.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    {query.queryType === 'search' ? (
                      <div className="p-1.5 bg-blue-50 rounded">
                        <Search className="w-4 h-4 text-blue-600" />
                      </div>
                    ) : (
                      <div className="p-1.5 bg-purple-50 rounded">
                        <MessageSquare className="w-4 h-4 text-purple-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate" title={query.query}>
                        {query.query}
                      </p>
                      <p className="text-xs text-gray-500">
                        {query.resultCount} results
                        {query.latencyMs && ` · ${query.latencyMs}ms`}
                        {query.topScore && ` · score: ${query.topScore.toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 ml-4">
                    <span
                      className={clsx(
                        'px-2 py-0.5 text-xs rounded-full',
                        query.queryType === 'search'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      )}
                    >
                      {query.queryType}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(query.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
