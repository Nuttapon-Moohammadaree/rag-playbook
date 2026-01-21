import { useState } from 'react';
import { FileText, Search, MessageSquare, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import DocumentsPanel from './components/documents/DocumentsPanel';
import SearchInterface from './components/search/SearchInterface';
import AskInterface from './components/ask/AskInterface';

type Tab = 'documents' | 'search' | 'ask';

const tabs = [
  { id: 'documents' as const, label: 'Documents', icon: FileText },
  { id: 'search' as const, label: 'Search', icon: Search },
  { id: 'ask' as const, label: 'Ask', icon: MessageSquare },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('documents');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">RAG MCP Server</h1>
            </div>
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'flex items-center space-x-2 px-1 py-4 border-b-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'documents' && <DocumentsPanel />}
        {activeTab === 'search' && <SearchInterface />}
        {activeTab === 'ask' && <AskInterface />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-gray-500 text-center">
            RAG MCP Server v1.0.0 - Document Retrieval and Question Answering
          </p>
        </div>
      </footer>
    </div>
  );
}
