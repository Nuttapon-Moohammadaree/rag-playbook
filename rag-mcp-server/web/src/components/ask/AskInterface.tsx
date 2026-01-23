import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageSquare, Send, RefreshCw, Settings2, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askQuestion, type AskResponse } from '../../api/client';

export default function AskInterface() {
  const [question, setQuestion] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState({
    limit: 5,
    threshold: 0.5,
    rerank: true,
    verify: false,
  });

  const askMutation = useMutation({
    mutationFn: askQuestion,
  });

  const result = askMutation.data?.data;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    askMutation.mutate({
      question: question.trim(),
      ...options,
    });
  };

  return (
    <div className="space-y-6">
      {/* Question Form */}
      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ask a question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to know?"
              rows={3}
              className="input resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1"
            >
              <Settings2 className="w-4 h-4" />
              <span>Advanced options</span>
            </button>

            <button
              type="submit"
              disabled={askMutation.isPending || !question.trim()}
              className="btn-primary"
            >
              {askMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Ask
                </>
              )}
            </button>
          </div>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Context Chunks
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={options.limit}
                  onChange={(e) => setOptions({ ...options, limit: parseInt(e.target.value) || 5 })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Score Threshold
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={options.threshold}
                  onChange={(e) => setOptions({ ...options, threshold: parseFloat(e.target.value) || 0.5 })}
                  className="input"
                />
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.rerank}
                    onChange={(e) => setOptions({ ...options, rerank: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Enable reranking</span>
                </label>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.verify}
                    onChange={(e) => setOptions({ ...options, verify: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Enable verification</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  LLM verifies answer is grounded in sources
                </p>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Error State */}
      {askMutation.error && (
        <div className="card p-4 bg-red-50 border-red-200">
          <p className="text-red-700">Failed to get answer. Please try again.</p>
        </div>
      )}

      {/* Answer */}
      {result && (
        <div className="space-y-4">
          {/* Verification Badge */}
          {result.verification && (
            <VerificationBadge verification={result.verification} confidence={result.confidence} />
          )}

          {/* Answer Card */}
          <div className="card p-6">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1">
                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.answer}
                  </ReactMarkdown>
                </div>

                {/* Model info */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Model: {result.model}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sources */}
          {result.sources && result.sources.length > 0 && (
            <div className="card p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Sources</h3>
              <div className="space-y-2">
                {result.sources.map((source, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {source.filename}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {(source.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {source.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unsupported Claims Warning */}
          {result.verification?.unsupportedClaims && result.verification.unsupportedClaims.length > 0 && (
            <div className="card p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800">Unsupported Claims</h4>
                  <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
                    {result.verification.unsupportedClaims.map((claim, i) => (
                      <li key={i}>{claim}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!result && !askMutation.isPending && (
        <div className="card p-8 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Ask anything</h3>
          <p className="mt-2 text-gray-500">
            I'll search through your documents and provide an answer with sources.
          </p>
        </div>
      )}
    </div>
  );
}

interface VerificationBadgeProps {
  verification: NonNullable<AskResponse['verification']>;
  confidence?: number;
}

function VerificationBadge({ verification, confidence }: VerificationBadgeProps) {
  const isGrounded = verification.isGrounded;
  const score = verification.groundingScore;

  return (
    <div className={clsx(
      'card p-4 flex items-center justify-between',
      isGrounded ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
    )}>
      <div className="flex items-center space-x-3">
        {isGrounded ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
        )}
        <div>
          <span className={clsx(
            'text-sm font-medium',
            isGrounded ? 'text-green-800' : 'text-yellow-800'
          )}>
            {isGrounded ? 'Verified Answer' : 'Partially Verified'}
          </span>
          <p className={clsx(
            'text-xs',
            isGrounded ? 'text-green-600' : 'text-yellow-600'
          )}>
            {isGrounded
              ? 'Answer is well-grounded in source documents'
              : 'Some claims may not be fully supported'}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="text-right">
          <div className="text-xs text-gray-500">Grounding Score</div>
          <div className={clsx(
            'text-lg font-semibold',
            score >= 0.7 ? 'text-green-600' : score >= 0.5 ? 'text-yellow-600' : 'text-red-600'
          )}>
            {(score * 100).toFixed(0)}%
          </div>
        </div>
        {confidence !== undefined && (
          <div className="text-right">
            <div className="text-xs text-gray-500">Confidence</div>
            <div className={clsx(
              'text-lg font-semibold',
              confidence >= 0.7 ? 'text-green-600' : confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {(confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
