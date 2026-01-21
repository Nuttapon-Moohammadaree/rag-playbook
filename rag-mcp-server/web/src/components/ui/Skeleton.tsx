import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-gray-200';

  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={clsx(baseStyles, variantStyles[variant], className)}
      style={style}
    />
  );
}

export function DocumentTableSkeleton() {
  return (
    <div className="card">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chunks</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {[...Array(5)].map((_, i) => (
            <tr key={i}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <Skeleton variant="circular" width={20} height={20} className="mr-3" />
                  <div className="space-y-2">
                    <Skeleton height={16} width={150} />
                    <Skeleton height={12} width={200} />
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Skeleton height={20} width={40} className="rounded-full" />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Skeleton height={16} width={60} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Skeleton height={16} width={30} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Skeleton height={20} width={70} className="rounded-full" />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right">
                <Skeleton variant="circular" width={24} height={24} className="ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchResultSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <Skeleton variant="circular" width={24} height={24} />
              <div className="flex items-center space-x-2">
                <Skeleton variant="circular" width={16} height={16} />
                <Skeleton height={16} width={120} />
              </div>
            </div>
            <Skeleton height={24} width={50} className="rounded" />
          </div>
          <div className="mt-3 pl-9 space-y-2">
            <Skeleton height={14} width="100%" />
            <Skeleton height={14} width="90%" />
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width={200} className="mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
