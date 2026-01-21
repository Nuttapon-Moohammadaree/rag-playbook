# RAG MCP Server

A production-ready Retrieval-Augmented Generation (RAG) server implementing the Model Context Protocol (MCP) for seamless integration with Claude Code and other MCP-compatible clients.

## Features

- **Multi-format Document Support**: PDF, DOCX, PPTX, XLSX, CSV, HTML, JSON, RTF, TXT
- **Semantic Search**: BGE-M3 embeddings with Qdrant vector database
- **Hybrid Retrieval**: Vector similarity + BM25 keyword search with RRF fusion
- **LLM-powered Enhancements**:
  - HyDE (Hypothetical Document Embeddings) for query expansion
  - Query enhancement and rewriting
  - Auto-summarization and tagging
  - Reranking with cross-encoder models
- **MCP Integration**: Full MCP protocol support for Claude Code
- **Security Hardened**: Path traversal protection, rate limiting, input validation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client (Claude Code)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       MCP Server Layer                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │ search  │  │   ask   │  │documents│  │  llm (enhance)  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │
└───────┼────────────┼───────────┼─────────────────┼──────────┘
        │            │           │                 │
        ▼            ▼           ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                        Core Services                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │Retrieval │ │   Ask    │ │Ingestion │ │  LLM Services  │  │
│  │ Service  │ │ Service  │ │ Service  │ │ HyDE/Reranking │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬────────┘  │
└───────┼────────────┼───────────┼────────────────┼───────────┘
        │            │           │                │
        ▼            ▼           ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Storage Layer                           │
│         ┌──────────────┐        ┌──────────────┐            │
│         │    Qdrant    │        │    SQLite    │            │
│         │   (Vectors)  │        │  (Metadata)  │            │
│         └──────────────┘        └──────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 18+ or Bun
- Qdrant vector database
- LiteLLM-compatible API endpoint (for embeddings and LLM features)

### Setup

```bash
# Clone the repository
git clone https://github.com/Nuttapon-Moohammadaree/rag-playbook.git
cd rag-playbook/rag-mcp-server

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Build the project
npm run build
```

## Configuration

Create a `.env` file with the following variables:

```env
# LiteLLM API Configuration
LITELLM_API_KEY=your-api-key
LITELLM_BASE_URL=http://localhost:4000/v1

# Embedding Configuration
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=documents

# LLM Features (optional)
LLM_MODEL=gpt-4o-mini
AUTO_SUMMARY=false
AUTO_TAGS=false
HYDE_ENABLED=false
RERANKING_ENABLED=false

# Storage
SQLITE_PATH=./data/rag.db
```

## Usage

### As MCP Server (with Claude Code)

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/rag-mcp-server/dist/mcp/server.js"],
      "env": {
        "LITELLM_API_KEY": "your-key"
      }
    }
  }
}
```

### Standalone Mode

```bash
# Start the MCP server
npm run mcp

# Or run in development mode
npm run dev
```

## MCP Tools

### `rag_search`
Semantic search across indexed documents.

```typescript
{
  query: string,           // Search query
  limit?: number,          // Max results (default: 10)
  threshold?: number,      // Min similarity score (0-1)
  fileTypes?: string[],    // Filter by file types
  useHyde?: boolean,       // Enable HyDE expansion
  useReranking?: boolean   // Enable result reranking
}
```

### `rag_ask`
Answer questions using retrieved context.

```typescript
{
  question: string,        // Question to answer
  limit?: number,          // Context chunks to retrieve
  useHyde?: boolean,       // Enable HyDE
  useReranking?: boolean   // Enable reranking
}
```

### `rag_index_document`
Index a document from file path.

```typescript
{
  path: string,            // File path to index
  force?: boolean          // Force reindex if exists
}
```

### `rag_index_text`
Index raw text content.

```typescript
{
  content: string,         // Text content
  title: string,           // Document title
  metadata?: object        // Optional metadata
}
```

### `rag_list_documents`
List all indexed documents.

```typescript
{
  status?: string,         // Filter: indexed, processing, failed
  fileType?: string        // Filter by file type
}
```

### `rag_delete_document`
Delete a document by ID.

```typescript
{
  documentId: string       // UUID of document to delete
}
```

### `rag_enhance_query`
Enhance a search query using LLM.

```typescript
{
  query: string,           // Original query
  method?: string          // expand, rewrite, or both
}
```

## Supported File Types

| Type | Extensions | Parser |
|------|------------|--------|
| PDF | `.pdf` | pdf-parse |
| Word | `.docx` | mammoth |
| PowerPoint | `.pptx` | officeparser |
| Excel | `.xlsx`, `.xls` | xlsx |
| CSV | `.csv` | built-in |
| HTML | `.html`, `.htm` | cheerio |
| JSON | `.json` | built-in |
| RTF | `.rtf` | built-in |
| Text | `.txt`, `.md` | built-in |

## Security Features

- **Path Traversal Protection**: All file paths are validated and canonicalized
- **Rate Limiting**: Configurable limits on search and indexing operations
- **Input Validation**: Zod schemas for all inputs with size limits
- **UUID Validation**: Document IDs must be valid UUIDs
- **Error Sanitization**: Internal errors are sanitized before client exposure
- **Document Locking**: Prevents race conditions during concurrent indexing

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

Current test coverage: **529 tests**

## Project Structure

```
src/
├── config/          # Configuration management
├── core/
│   ├── ask/         # Question answering service
│   ├── chunking/    # Text chunking strategies
│   ├── embedding/   # Embedding generation
│   ├── ingestion/   # Document parsing & indexing
│   │   └── parsers/ # File format parsers
│   ├── llm/         # LLM services (HyDE, summarizer, tagger)
│   ├── reranking/   # Result reranking
│   └── retrieval/   # Search & retrieval
├── mcp/
│   ├── server.ts    # MCP server entry point
│   └── tools/       # MCP tool implementations
├── storage/
│   ├── qdrant.ts    # Vector storage
│   └── sqlite.ts    # Metadata storage
├── types/           # TypeScript definitions
└── utils/           # Utilities (security, caching)
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Type check
npx tsc --noEmit

# Lint (if configured)
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [Qdrant](https://qdrant.tech/) - Vector database
- [LiteLLM](https://litellm.ai/) - LLM API proxy
- [BGE-M3](https://huggingface.co/BAAI/bge-m3) - Multilingual embeddings
