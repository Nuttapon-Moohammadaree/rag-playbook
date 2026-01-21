# RAG Playbook

A comprehensive collection of RAG (Retrieval-Augmented Generation) implementations and tools for building AI-powered document search and question-answering systems.

## Projects

### [RAG MCP Server](./rag-mcp-server/)

Production-ready RAG server implementing the Model Context Protocol (MCP) for seamless integration with Claude Code.

**Key Features:**
- Multi-format document support (PDF, DOCX, PPTX, XLSX, CSV, HTML, JSON, RTF, TXT)
- Semantic search with BGE-M3 embeddings + Qdrant vector database
- Hybrid retrieval (vector + BM25) with RRF fusion
- LLM-powered enhancements (HyDE, query expansion, reranking, auto-summarization)
- Security hardened (path traversal protection, rate limiting, input validation)
- 529+ automated tests

```bash
cd rag-mcp-server
npm install
npm run build
npm run mcp
```

[View full documentation](./rag-mcp-server/README.md)

## Repository Structure

```
rag-playbook/
├── rag-mcp-server/          # Main RAG MCP Server implementation
│   ├── src/
│   │   ├── core/            # Core services (retrieval, ingestion, LLM)
│   │   ├── mcp/             # MCP protocol implementation
│   │   ├── storage/         # Qdrant + SQLite storage
│   │   └── utils/           # Security & caching utilities
│   └── README.md            # Detailed documentation
├── rag-mcp-complete-design.md  # Original design document
└── CLAUDE.md                # Claude Code configuration
```

## Quick Start

### Prerequisites

- Node.js 18+ or Bun
- Qdrant vector database
- LiteLLM-compatible API endpoint

### Setup

```bash
# Clone repository
git clone https://github.com/Nuttapon-Moohammadaree/rag-playbook.git
cd rag-playbook/rag-mcp-server

# Install and build
npm install
npm run build

# Configure environment
cp .env.example .env
# Edit .env with your API keys and endpoints

# Run MCP server
npm run mcp
```

### Integration with Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/rag-mcp-server/dist/mcp/server.js"]
    }
  }
}
```

## MCP Tools Available

| Tool | Description |
|------|-------------|
| `rag_search` | Semantic search across indexed documents |
| `rag_ask` | Answer questions using retrieved context |
| `rag_index_document` | Index a document from file path |
| `rag_index_text` | Index raw text content |
| `rag_list_documents` | List all indexed documents |
| `rag_delete_document` | Delete a document by ID |
| `rag_enhance_query` | Enhance search query using LLM |

## Technology Stack

- **Runtime**: Node.js / Bun
- **Language**: TypeScript
- **Vector DB**: Qdrant
- **Metadata DB**: SQLite (better-sqlite3)
- **Embeddings**: BGE-M3 via LiteLLM
- **Protocol**: Model Context Protocol (MCP)
- **Testing**: Vitest

## Development

```bash
cd rag-mcp-server

# Run tests
npm test

# Type check
npx tsc --noEmit

# Development mode
npm run dev
```

## License

MIT

## Author

Nuttapon Moohammadaree
