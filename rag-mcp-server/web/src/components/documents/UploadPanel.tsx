import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Upload, FileText, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { uploadFile } from '../../api/client';

interface UploadPanelProps {
  onClose: () => void;
}

export default function UploadPanel({ onClose }: UploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file),
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
      setSelectedFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'text/html': ['.html'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB max
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }
    setError(null);
    uploadMutation.mutate(selectedFile);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Upload Document</h3>
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
              : selectedFile
              ? 'border-green-500 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          )}
        >
          <input {...getInputProps()} />
          {selectedFile ? (
            <>
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
              <p className="mt-2 text-sm font-medium text-gray-900">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {formatFileSize(selectedFile.size)} • Click or drag to replace
              </p>
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-400 mx-auto" />
              <p className="mt-2 text-sm text-gray-600">
                {isDragActive
                  ? 'Drop the file here...'
                  : 'Drag & drop a file here, or click to select'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Supported: PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML (max 50MB)
              </p>
            </>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center space-x-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
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
            disabled={uploadMutation.isPending || !selectedFile}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Upload & Index
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
