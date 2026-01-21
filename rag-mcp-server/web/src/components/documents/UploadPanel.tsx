import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { uploadDocument } from '../../api/client';

interface UploadPanelProps {
  onClose: () => void;
}

export default function UploadPanel({ onClose }: UploadPanelProps) {
  const [filepath, setFilepath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (path: string) => uploadDocument(path),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        onClose();
      } else {
        setError(response.error || 'Upload failed');
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Upload failed');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      // Display the filename to help users understand what they selected
      // Note: This UI indexes files by server path, not browser upload
      setFilepath(acceptedFiles[0].name);
      setError('Note: Please enter the server path where this file is located');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'text/html': ['.html'],
    },
    maxFiles: 1,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filepath.trim()) {
      setError('Please enter a file path');
      return;
    }
    setError(null);
    uploadMutation.mutate(filepath.trim());
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Index Document</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-gray-400'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 text-gray-400 mx-auto" />
          <p className="mt-2 text-sm text-gray-600">
            {isDragActive
              ? 'Drop to see filename...'
              : 'Drop a file to see its name (helps you find the server path)'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Note: Enter the server file path below to index the document
          </p>
        </div>

        {/* Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Enter server file path</span>
          </div>
        </div>

        {/* Manual file path input */}
        <div>
          <label htmlFor="filepath" className="block text-sm font-medium text-gray-700 mb-1">
            File Path
          </label>
          <input
            type="text"
            id="filepath"
            value={filepath}
            onChange={(e) => setFilepath(e.target.value)}
            placeholder="/path/to/document.pdf"
            className="input"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter the absolute path to the document on the server
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center space-x-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploadMutation.isPending}
            className="btn-primary"
          >
            {uploadMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Index Document
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function RefreshCw(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}
