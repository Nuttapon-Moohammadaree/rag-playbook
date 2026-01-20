# RAG MCP Server - Complete Architecture Design
## With MCPO + Open WebUI Integration

---

## 🎯 Project Overview

**ระบบ RAG MCP Server** ที่รองรับ:
- ✅ Claude Code (MCP stdio)
- ✅ Open WebUI (via MCPO → OpenAPI)
- ✅ Web UI สำหรับ client จัดการเอกสาร
- ✅ LLM-Enhanced features (gpt-oss-120b)

---

## 📚 Use Case: CS Playbook Knowledge Base

### Dataset Overview

```
CS_Playbook/
├── FSE1/          (2 files)    - Field Service Engineer Level 1
├── FSE2/          (42 files)   - Field Service Engineer Level 2
├── GOV1/          (0 files)    - Government Tier 1
├── GOV2/          (3 files)    - Government Tier 2
├── CyberSec/      (6 files)    - Cybersecurity Playbooks
├── SP/            (12 files)   - Service Provider
└── TL and Systems/ (61 files)  - Team Lead & Systems

Total: 126 files, ~400MB
```

### File Types Distribution

| Type | Count | Content |
|------|-------|---------|
| **DOCX** | 94 | Incident Response Playbooks |
| **PPTX** | 12 | Training presentations |
| **XLSX** | 10 | Configuration matrices, checklists |
| **PDF** | 8 | Technical reports, vendor docs |

### Example Playbook Content

**ชื่อไฟล์:** `KTCS Incident Response Playbook-Cisco WLC AireOS – Software Upgrade.docx`

**โครงสร้างเอกสาร:**
- Document Info (Version, Author, Date)
- Scope & Objective
- Prerequisites
- Step-by-step Procedures (with screenshots)
- Rollback Plan
- Troubleshooting
- Related Documents

### Search Use Cases

```
User: "วิธี upgrade Cisco WLC"
→ ค้นหา playbooks เกี่ยวกับ Cisco WLC upgrade

User: "ขั้นตอน replace AP ใน SDA"
→ ค้นหา KTCS Incident Response Playbook-SDA Replace New AP.docx

User: "troubleshoot SD-WAN spoke"
→ ค้นหา การตรวจสอบปัญหา Spoke SD-WAN.docx
```

### Collection Organization

```typescript
// Suggested collections for CS Playbook
const collections = [
  { name: 'fse-playbooks', description: 'Field Service Engineer Playbooks' },
  { name: 'cybersec', description: 'Cybersecurity Playbooks' },
  { name: 'gov-playbooks', description: 'Government Customer Playbooks' },
  { name: 'sp-playbooks', description: 'Service Provider Playbooks' },
  { name: 'training', description: 'Training Materials (PPTX)' },
];
```

---

## 📋 Configuration Summary

```yaml
# API Endpoints
LITELLM_API_KEY: sk-cwK7wBD8x4z6slQVrfejLg
LITELLM_BASE_URL: https://csai.ait.co.th/litellm/v1

# Models (see Model Configuration Reference below)
EMBEDDING_MODEL: BAAI/bge-m3
RERANKER_MODEL: BAAI/bge-reranker-v2-m3
LLM_MODEL: gpt-oss-120b
IMAGE_DESCRIPTION_MODEL: gemma-3-27b

# Limits
MAX_FILE_SIZE: 500MB
SUPPORTED_LANGUAGES: th, en

# Auth
AUTH_MODE: local  # 'ldap' for production
```

### 🎯 Model Configuration Reference (Single Source of Truth)

> **Important**: นี่คือ reference หลักสำหรับ model configuration ทุกที่ในระบบต้องอ้างอิงจากตารางนี้

| Environment Variable | Model | Parameters | Purpose | Rationale |
|---------------------|-------|------------|---------|-----------|
| `LLM_MODEL` | `gpt-oss-120b` | 120B | Main LLM สำหรับทุก task ยกเว้น vision | ฉลาดที่สุด, self-hosted ไม่กังวล token, ใช้เป็น default |
| `IMAGE_DESCRIPTION_MODEL` | `gemma-3-27b` | 27B | Vision tasks เท่านั้น | gpt-oss-120b ไม่มี vision capability, gemma-3 รองรับ multimodal |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | - | Text embeddings | Multilingual, รองรับ Thai+English |
| `RERANKER_MODEL` | `BAAI/bge-reranker-v2-m3` | - | Search result reranking | Cross-encoder สำหรับ precise ranking |

**Model Selection Logic:**
```
Task Type          → Model Used
─────────────────────────────────────
Vision tasks       → IMAGE_DESCRIPTION_MODEL (gemma-3-27b)
  - image_description
  - diagram_analysis
  - visual_content_extraction

All other tasks    → LLM_MODEL (gpt-oss-120b)
  - summarization, qa_generation, answer_generation
  - entity_extraction, query_expansion, hyde
  - document_linking, contradiction_detection, gap_analysis
```

**Note**: ถ้า `IMAGE_DESCRIPTION_MODEL` ไม่ได้ config ระบบจะ log warning แต่ไม่ fail (vision tasks จะถูก skip)

---

## 📐 System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                  Clients                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Claude Code   │  │   Open WebUI    │  │   Web Browser   │  │  Other Apps │ │
│  │   (MCP Client)  │  │  (OpenAPI)      │  │   (React UI)    │  │ (REST API)  │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                    │                   │        │
│           │ stdio              │ HTTP               │ HTTP              │ HTTP   │
└───────────┼────────────────────┼────────────────────┼───────────────────┼────────┘
            │                    │                    │                   │
            ▼                    ▼                    ▼                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose                                       │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                         MCPO (Port 8000)                                     │ │
│  │                    MCP-to-OpenAPI Proxy Server                              │ │
│  │  ┌───────────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Exposes MCP Tools as REST endpoints for Open WebUI:                  │  │ │
│  │  │  • POST /rag/search        → search tool                              │  │ │
│  │  │  • POST /rag/ask           → ask tool (RAG + LLM)                     │  │ │
│  │  │  • POST /rag/index         → index_document tool                      │  │ │
│  │  │  • GET  /rag/collections   → list_collections tool                    │  │ │
│  │  │  • GET  /rag/docs          → Auto-generated Swagger UI                │  │ │
│  │  └───────────────────────────────────────────────────────────────────────┘  │ │
│  │                                    │ stdio                                   │ │
│  │                                    ▼                                         │ │
│  └────────────────────────────────────┼─────────────────────────────────────────┘ │
│                                       │                                           │
│  ┌────────────────────────────────────┼─────────────────────────────────────────┐ │
│  │                         rag-mcp-server                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────────┐  │ │
│  │  │   MCP Server    │  │    REST API     │  │     Web UI (React)           │  │ │
│  │  │   (stdio)       │  │    (Express)    │  │     (Vite + Tailwind)        │  │ │
│  │  │                 │  │    Port: 3001   │  │     Port: 3000               │  │ │
│  │  │  - Tools        │  │                 │  │                              │  │ │
│  │  │  - Resources    │  │  - /api/docs    │  │  - Dashboard                 │  │ │
│  │  │                 │  │  - /api/search  │  │  - Documents                 │  │ │
│  │  │                 │  │  - /api/...     │  │  - Search Testing            │  │ │
│  │  │                 │  │                 │  │  - Analytics                 │  │ │
│  │  │                 │  │                 │  │  - Knowledge Graph           │  │ │
│  │  │                 │  │                 │  │  - Maintenance               │  │ │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────────────────────────┘  │ │
│  │           │                    │                                              │ │
│  │           └────────────────────┴──────────────────┐                          │ │
│  │                                                   │                          │ │
│  │  ┌────────────────────────────────────────────────┼───────────────────────┐  │ │
│  │  │                      Core Services             │                       │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┴────┐ ┌────────────┐   │  │ │
│  │  │  │Ingestion │ │ Chunking │ │Retrieval │ │   LLM    │ │ Knowledge  │   │  │ │
│  │  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │   Graph    │   │  │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘   │  │ │
│  │  └────────────────────────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
│                    │                    │                    │                    │
│                    ▼                    ▼                    ▼                    │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │       Qdrant        │  │       SQLite        │  │   LiteLLM (External)     │  │
│  │    (Vector DB)      │  │    (Metadata +      │  │  csai.ait.co.th/litellm  │  │
│  │    Port: 6333       │  │     Graph DB)       │  │                          │  │
│  │                     │  │                     │  │  • bge-m3 (embed)        │  │
│  │                     │  │                     │  │  • bge-reranker-v2-m3    │  │
│  │                     │  │                     │  │  • gpt-oss-120b (LLM)    │  │
│  │                     │  │                     │  │  • gemma-3-27b (Vision)  │  │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────────────┘  │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🐳 Docker Compose

```yaml
version: '3.8'

services:
  # ============================================
  # MCPO - MCP to OpenAPI Proxy (for Open WebUI)
  # ============================================
  mcpo:
    image: ghcr.io/open-webui/mcpo:main
    ports:
      - "8000:8000"
    volumes:
      - ./config/mcpo-config.json:/app/config.json:ro
    command: ["--config", "/app/config.json", "--port", "8000"]
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - rag-network

  # ============================================
  # Main Application (MCP Server + API + Web UI)
  # ============================================
  app:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"   # Web UI
      - "3001:3001"   # REST API
    environment:
      - NODE_ENV=production
      - QDRANT_URL=http://qdrant:6333
      - LITELLM_API_KEY=${LITELLM_API_KEY}
      - LITELLM_BASE_URL=https://csai.ait.co.th/litellm/v1
      - EMBEDDING_MODEL=BAAI/bge-m3
      - RERANKER_MODEL=BAAI/bge-reranker-v2-m3
      - LLM_MODEL=gpt-oss-120b
      - IMAGE_DESCRIPTION_MODEL=gemma-3-27b
      - SQLITE_PATH=/data/sqlite/rag.db
      - UPLOAD_DIR=/data/uploads
      - MAX_FILE_SIZE=524288000  # 500MB
      - AUTH_MODE=${AUTH_MODE:-local}
      # LDAP config (uncomment for production)
      # - LDAP_URL=${LDAP_URL}
      # - LDAP_BASE_DN=${LDAP_BASE_DN}
      # - LDAP_BIND_DN=${LDAP_BIND_DN}
      # - LDAP_BIND_PASSWORD=${LDAP_BIND_PASSWORD}
    volumes:
      - ./data/uploads:/data/uploads
      - ./data/sqlite:/data/sqlite
      - ./memory:/app/memory
    depends_on:
      qdrant:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    networks:
      - rag-network

  # ============================================
  # Qdrant Vector Database
  # ============================================
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./data/qdrant:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    networks:
      - rag-network

networks:
  rag-network:
    driver: bridge
```

---

## ⚙️ MCPO Configuration

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/app/dist/mcp/server.js"],
      "env": {
        "QDRANT_URL": "http://qdrant:6333",
        "LITELLM_API_KEY": "${LITELLM_API_KEY}",
        "LITELLM_BASE_URL": "https://csai.ait.co.th/litellm/v1",
        "EMBEDDING_MODEL": "BAAI/bge-m3",
        "RERANKER_MODEL": "BAAI/bge-reranker-v2-m3",
        "LLM_MODEL": "gpt-oss-120b",
        "IMAGE_DESCRIPTION_MODEL": "gemma-3-27b"
      }
    }
  }
}
```

---

## 🔗 Open WebUI Integration

### Setup Steps

1. **Start Services:**
   ```bash
   docker-compose up -d
   ```

2. **Configure Open WebUI:**
   - Go to **Settings → Tools → OpenAPI Servers**
   - Add new server:
     ```
     Name: RAG Knowledge Base
     URL: http://localhost:8000/rag
     ```

3. **Available Tools in Open WebUI:**

| Tool | Description | Usage Example |
|------|-------------|---------------|
| `search` | Semantic search | "ค้นหาเอกสารเกี่ยวกับ API" |
| `ask` | RAG + LLM answer | "ราคา subscription เท่าไหร่?" |
| `list_documents` | Show all docs | "แสดงรายการเอกสารทั้งหมด" |
| `summarize_document` | Generate summary | "สรุปเอกสาร product-guide.pdf" |
| `find_related` | Related documents | "หาเอกสารที่เกี่ยวข้องกับ pricing" |

### Chat Example

```
User: ราคา subscription ของเรามีกี่แบบ?

[Open WebUI calls: POST /rag/ask]
{
  "question": "ราคา subscription ของเรามีกี่แบบ?",
  "include_sources": true
}
Assistant Response:
```
จากเอกสารในระบบ พบว่าราคา subscription มี 3 แพ็คเกจ:

| Plan | ราคา | Features |
|------|------|----------|
| **Basic** | ฿299/เดือน | 10 users, 5GB storage |
| **Pro** | ฿899/เดือน | 50 users, 50GB storage |
| **Enterprise** | ติดต่อฝ่ายขาย | Unlimited |

📚 Sources: pricing.pdf, plans.md
```

---

## 🖥️ Claude Code Configuration

### Docker-based Deployment

เมื่อรัน RAG MCP Server ผ่าน Docker ให้ config Claude Code ดังนี้:

**`~/.claude/claude_desktop_config.json`**
```json
{
  "mcpServers": {
    "rag-mcp": {
      "command": "docker",
      "args": [
        "exec", "-i", "rag-mcp-server-app-1",
        "node", "/app/dist/mcp/server.js"
      ],
      "env": {}
    }
  }
}
```

### Local Development

สำหรับการพัฒนา local โดยไม่ใช้ Docker:

**`~/.claude/claude_desktop_config.json`**
```json
{
  "mcpServers": {
    "rag-mcp": {
      "command": "node",
      "args": ["/path/to/rag-mcp-server/dist/mcp/server.js"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "LITELLM_API_KEY": "sk-cwK7wBD8x4z6slQVrfejLg",
        "LITELLM_BASE_URL": "https://csai.ait.co.th/litellm/v1",
        "EMBEDDING_MODEL": "BAAI/bge-m3",
        "RERANKER_MODEL": "BAAI/bge-reranker-v2-m3",
        "LLM_MODEL": "gpt-oss-120b",
        "IMAGE_DESCRIPTION_MODEL": "gemma-3-27b",
        "SQLITE_PATH": "./data/sqlite/rag.db"
      }
    }
  }
}
```

### Verification

หลัง config แล้ว restart Claude Code และทดสอบด้วย:
```
User: ค้นหาเอกสารเกี่ยวกับ pricing
Assistant: [เรียกใช้ search tool จาก rag-mcp server]
```

---

## 🔧 MCP Tools Specification

### Document Management

```typescript
// index_document - Index a file
{
  name: "index_document",
  description: "Index a document into the RAG system for searching",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to document" },
      collection: { type: "string", default: "default" },
      metadata: { type: "object" }
    },
    required: ["file_path"]
  }
}

// index_text - Index raw text
{
  name: "index_text",
  description: "Index text content directly",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string" },
      title: { type: "string" },
      collection: { type: "string", default: "default" }
    },
    required: ["content", "title"]
  }
}

// list_documents
{
  name: "list_documents",
  description: "List all indexed documents",
  inputSchema: {
    type: "object",
    properties: {
      collection: { type: "string" },
      limit: { type: "number", default: 50 }
    }
  }
}

// delete_document
{
  name: "delete_document",
  description: "Delete a document from index",
  inputSchema: {
    type: "object",
    properties: {
      document_id: { type: "string" }
    },
    required: ["document_id"]
  }
}
```

### Search Tools

```typescript
// search - Semantic search
{
  name: "search",
  description: "Search documents using semantic similarity",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      collection: { type: "string" },
      top_k: { type: "number", default: 5 },
      rerank: { type: "boolean", default: true }
    },
    required: ["query"]
  }
}

// ask - RAG with answer generation
{
  name: "ask",
  description: "Ask a question and get AI-generated answer with sources",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string" },
      collection: { type: "string" },
      include_sources: { type: "boolean", default: true }
    },
    required: ["question"]
  }
}

// hybrid_search
{
  name: "hybrid_search",
  description: "Combined semantic and keyword search",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      collection: { type: "string" },
      alpha: { type: "number", default: 0.5 }
    },
    required: ["query"]
  }
}
```

### LLM-Enhanced Tools

```typescript
// summarize_document
{
  name: "summarize_document",
  description: "Generate AI summary of a document",
  inputSchema: {
    type: "object",
    properties: {
      document_id: { type: "string" },
      style: { type: "string", enum: ["brief", "detailed", "bullet_points"] }
    },
    required: ["document_id"]
  }
}

// find_related
{
  name: "find_related",
  description: "Find documents related to a given document",
  inputSchema: {
    type: "object",
    properties: {
      document_id: { type: "string" },
      relationship_type: { 
        type: "string", 
        enum: ["all", "references", "related_to", "depends_on"] 
      }
    },
    required: ["document_id"]
  }
}

// detect_contradictions
{
  name: "detect_contradictions",
  description: "Find contradicting information across documents",
  inputSchema: {
    type: "object",
    properties: {
      collection: { type: "string" },
      topic: { type: "string" }
    }
  }
}

// analyze_knowledge_gaps
{
  name: "analyze_knowledge_gaps",
  description: "Analyze failed queries to find missing knowledge",
  inputSchema: {
    type: "object",
    properties: {
      days: { type: "number", default: 30 }
    }
  }
}
```

### Collection & Analytics Tools

```typescript
// create_collection
{
  name: "create_collection",
  description: "Create a new document collection",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" }
    },
    required: ["name"]
  }
}

// get_stats
{
  name: "get_stats",
  description: "Get RAG system statistics",
  inputSchema: { type: "object", properties: {} }
}

// get_query_analytics
{
  name: "get_query_analytics", 
  description: "Get query trends and analytics",
  inputSchema: {
    type: "object",
    properties: {
      days: { type: "number", default: 7 }
    }
  }
}
```

---

## 📁 Project Structure

```
rag-mcp-server/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
│
├── config/
│   ├── mcpo-config.json        # MCPO configuration
│   └── default.json            # App defaults
│
├── src/
│   ├── index.ts                # Entry point
│   │
│   ├── mcp/                    # MCP Server (for Claude + MCPO)
│   │   ├── server.ts
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   ├── documents.ts
│   │   │   ├── search.ts
│   │   │   ├── collections.ts
│   │   │   ├── llm.ts          # LLM-enhanced tools
│   │   │   └── analytics.ts
│   │   └── resources/
│   │       └── index.ts
│   │
│   ├── api/                    # REST API (for Web UI)
│   │   ├── server.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts         # Local + LDAP
│   │   │   ├── upload.ts       # 500MB limit
│   │   │   └── error.ts
│   │   └── routes/
│   │       ├── documents.ts
│   │       ├── collections.ts
│   │       ├── search.ts
│   │       ├── analytics.ts
│   │       └── auth.ts
│   │
│   ├── core/
│   │   ├── ingestion/
│   │   │   ├── service.ts
│   │   │   ├── parsers/        # PDF, DOCX, PPTX, XLSX, MD, TXT, HTML
│   │   │   └── image/          # Image extraction + OCR (Tesseract)
│   │   ├── chunking/
│   │   │   ├── service.ts
│   │   │   └── strategies/
│   │   ├── embedding/
│   │   │   ├── service.ts
│   │   │   └── litellm.ts      # BGE-M3 via LiteLLM
│   │   ├── retrieval/
│   │   │   ├── service.ts
│   │   │   ├── vector.ts
│   │   │   ├── hybrid.ts
│   │   │   └── reranker.ts     # BGE-reranker-v2-m3
│   │   ├── llm/                # LLM Features
│   │   │   ├── service.ts
│   │   │   ├── summarizer.ts
│   │   │   ├── tagger.ts
│   │   │   ├── qa-generator.ts
│   │   │   ├── query-enhancer.ts
│   │   │   ├── answer-generator.ts
│   │   │   ├── linker.ts
│   │   │   └── analyzer.ts
│   │   ├── knowledge-graph/
│   │   │   ├── service.ts
│   │   │   └── builder.ts
│   │   └── analytics/
│   │       └── service.ts
│   │
│   ├── storage/
│   │   ├── qdrant.ts
│   │   ├── sqlite.ts
│   │   └── graph.ts
│   │
│   ├── auth/
│   │   ├── local.ts
│   │   └── ldap.ts
│   │
│   └── types/
│       └── index.ts
│
├── web/                        # React Frontend
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── client.ts
│       ├── hooks/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Documents.tsx
│       │   ├── Collections.tsx
│       │   ├── Search.tsx
│       │   ├── Analytics.tsx
│       │   ├── KnowledgeGraph.tsx
│       │   ├── Maintenance.tsx
│       │   └── Settings.tsx
│       └── components/
│
├── memory/                     # Oracle-style ψ/
│   ├── retrospectives/
│   ├── learnings/
│   ├── logs/
│   └── resonance/
│
└── data/                       # Docker volumes
    ├── qdrant/
    ├── uploads/
    └── sqlite/
```

---

## 🗄️ Database Schema (SQLite)

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,           -- NULL for LDAP users
    role TEXT DEFAULT 'user',     -- 'admin', 'user', 'viewer'
    auth_type TEXT DEFAULT 'local', -- 'local', 'ldap'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);
```

### Documents Table
```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,          -- UUID
    filename TEXT NOT NULL,
    file_path TEXT,               -- Path in uploads/
    file_type TEXT,               -- 'pdf', 'docx', 'pptx', 'xlsx', 'md', 'txt', 'html', 'image'
    file_size INTEGER,
    collection_id TEXT,
    title TEXT,
    summary TEXT,                 -- LLM-generated
    tags TEXT,                    -- JSON array, LLM-generated
    language TEXT DEFAULT 'th',   -- 'th', 'en'
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'indexed', 'error'
    error_message TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id)
);

CREATE INDEX idx_documents_collection ON documents(collection_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created ON documents(created_at);
```

### Chunks Table
```sql
CREATE TABLE chunks (
    id TEXT PRIMARY KEY,          -- UUID
    document_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER,          -- Position in document
    start_pos INTEGER,            -- Character start position
    end_pos INTEGER,              -- Character end position
    token_count INTEGER,
    embedding_id TEXT,            -- Qdrant point ID
    metadata TEXT,                -- JSON: page_number, section, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks(embedding_id);
```

### Collections Table
```sql
CREATE TABLE collections (
    id TEXT PRIMARY KEY,          -- UUID
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    document_count INTEGER DEFAULT 0,
    qdrant_collection TEXT,       -- Qdrant collection name
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Query Logs Table (Analytics)
```sql
CREATE TABLE query_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    collection_id TEXT,
    user_id TEXT,
    source TEXT,                  -- 'mcp', 'api', 'webui'
    result_count INTEGER,
    top_score REAL,
    latency_ms INTEGER,
    was_successful BOOLEAN,       -- Did user find useful results?
    expanded_query TEXT,          -- LLM-expanded query
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_query_logs_created ON query_logs(created_at);
CREATE INDEX idx_query_logs_collection ON query_logs(collection_id);
CREATE INDEX idx_query_logs_successful ON query_logs(was_successful);
```

### Graph Edges Table (Knowledge Graph)
```sql
CREATE TABLE graph_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_doc_id TEXT NOT NULL,
    target_doc_id TEXT NOT NULL,
    relationship_type TEXT,       -- 'references', 'related_to', 'contradicts', 'depends_on'
    confidence REAL,              -- 0.0 - 1.0
    evidence TEXT,                -- JSON: supporting text/chunks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (target_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    UNIQUE(source_doc_id, target_doc_id, relationship_type)
);

CREATE INDEX idx_graph_edges_source ON graph_edges(source_doc_id);
CREATE INDEX idx_graph_edges_target ON graph_edges(target_doc_id);
CREATE INDEX idx_graph_edges_type ON graph_edges(relationship_type);
```

---

## 🖥️ Web UI Pages Summary

| Page | Features |
|------|----------|
| **Login** | Local auth (dev) / LDAP (prod) |
| **Dashboard** | Stats, recent docs, top queries, charts |
| **Documents** | Upload (500MB), list, view chunks, bulk actions |
| **Collections** | Create, manage, delete collections |
| **Search** | Test search, view results, debug info |
| **Analytics** | Query trends, latency, low-score alerts |
| **Knowledge Graph** | Visualize document connections |
| **Maintenance** | Outdated docs, contradictions, gaps |
| **Settings** | Embedding, chunking, auth config |

---

## 🔐 Authentication

### Local Mode (Development)
```typescript
// Simple username/password stored in SQLite
{
  username: "admin",
  password: "hashed_password",
  role: "admin"
}
```

### LDAP Mode (Production)
```typescript
// Connect to Active Directory
{
  url: "ldap://your-ad-server",
  baseDN: "dc=company,dc=com",
  bindDN: "cn=admin,dc=company,dc=com",
  bindPassword: "***",
  searchFilter: "(sAMAccountName={{username}})"
}
```

---

## 📊 LLM Features Summary

| Feature | Model | When Used | Benefit |
|---------|-------|-----------|---------|
| **Auto Summary** | gpt-oss-120b | On document upload | Better search discovery |
| **Auto Tags** | gpt-oss-120b | On document upload | Easy categorization |
| **QA Generation** | gpt-oss-120b | On document upload | Improved retrieval |
| **Entity Extraction** | gpt-oss-120b | On document upload | Knowledge graph nodes |
| **Query Expansion** | gpt-oss-120b | On every search | Better recall |
| **HyDE** | gpt-oss-120b | On complex queries | Better precision |
| **Answer Generation** | gpt-oss-120b | On `ask` tool | Direct answers |
| **Document Linking** | gpt-oss-120b | Background job | Knowledge graph edges |
| **Contradiction Detection** | gpt-oss-120b | Weekly job | Data quality |
| **Gap Analysis** | gpt-oss-120b | Weekly job | Content planning |
| **Image Description** | gemma-3-27b | On image upload | Visual content indexing |
| **Diagram Analysis** | gemma-3-27b | On diagram detection | Technical diagram understanding |
| **Visual Content Extraction** | gemma-3-27b | On visual element detection | Extract text/data from charts, tables in images |

### Model Selection Strategy

เลือกใช้ model ตามความซับซ้อนของ task เพื่อ balance ระหว่าง quality และ cost/latency:

| Model | Parameters | Tasks | Rationale |
|-------|------------|-------|-----------|
| **gpt-oss-120b** | 120B | Summarization, QA generation, Answer generation, Entity extraction, Query expansion, HyDE, Document linking, Contradiction detection, Gap analysis | Complex reasoning tasks ที่ต้องการความแม่นยำสูงและ context understanding ลึก |
| **gemma-3-27b** | 27B | Image descriptions, Diagram analysis, Visual content extraction | Lightweight tasks ที่ต้องการ speed มากกว่า depth - รูปภาพมักต้องการ description ตรงไปตรงมา ไม่ต้องการ deep reasoning |

**Benefits ของ dual-model approach:**
- **Cost efficiency**: ใช้ model เล็กสำหรับ high-volume image processing
- **Latency reduction**: gemma-3-27b ตอบเร็วกว่าประมาณ 2-4x สำหรับ batch image processing
- **Quality preservation**: Complex NLP tasks ยังคงใช้ full 120B model

**Fallback Strategy:**
- หาก `IMAGE_DESCRIPTION_MODEL` ไม่ได้ config → skip vision tasks (ไม่ fallback ไป gpt-oss เพราะไม่มี vision)
- ระบบจะ log warning และดำเนินการต่อโดยไม่ fail
- ตรวจสอบ model availability ตอน startup

### Model Selection Code Example (Extensible Registry Pattern)

```typescript
// config/model-registry.ts
// ===================================================
// Extensible Model Registry - เพิ่ม model ใหม่ได้ง่าย
// ===================================================

// Task categories - เพิ่ม category ใหม่ได้ที่นี่
type TaskCategory = 'reasoning' | 'vision';

// All supported task types
type TaskType =
  | 'summarization' | 'qa_generation' | 'answer_generation'
  | 'entity_extraction' | 'query_expansion' | 'hyde'
  | 'document_linking' | 'contradiction_detection' | 'gap_analysis'
  | 'image_description' | 'diagram_analysis' | 'visual_content_extraction';

// Map task to category
const TASK_CATEGORY_MAP: Record<TaskType, TaskCategory> = {
  // Reasoning tasks -> gpt-oss-120b
  summarization: 'reasoning',
  qa_generation: 'reasoning',
  answer_generation: 'reasoning',
  entity_extraction: 'reasoning',
  query_expansion: 'reasoning',
  hyde: 'reasoning',
  document_linking: 'reasoning',
  contradiction_detection: 'reasoning',
  gap_analysis: 'reasoning',

  // Vision tasks -> gemma-3-27b (gpt-oss ไม่มี vision)
  image_description: 'vision',
  diagram_analysis: 'vision',
  visual_content_extraction: 'vision',
};

// Model registry - single source of truth
interface ModelEntry {
  envVar: string;
  category: TaskCategory;
  required: boolean;
  fallbackCategory?: TaskCategory;  // ถ้า model ไม่พร้อมให้ fallback ไปที่ไหน
}

const MODEL_REGISTRY: Record<TaskCategory, ModelEntry> = {
  reasoning: {
    envVar: 'LLM_MODEL',
    category: 'reasoning',
    required: true,  // ต้องมี
  },
  vision: {
    envVar: 'IMAGE_DESCRIPTION_MODEL',
    category: 'vision',
    required: false,  // optional - ถ้าไม่มีก็ skip vision tasks
    // ไม่มี fallbackCategory เพราะ gpt-oss ไม่มี vision
  },
};

// ===================================================
// Model Selection Service
// ===================================================

interface ModelSelectionResult {
  model: string | null;
  category: TaskCategory;
  skipped: boolean;
  reason?: string;
}

export function selectModelForTask(task: TaskType): ModelSelectionResult {
  const category = TASK_CATEGORY_MAP[task];
  const entry = MODEL_REGISTRY[category];
  const model = process.env[entry.envVar];

  // Model configured - use it
  if (model) {
    return { model, category, skipped: false };
  }

  // Model not configured
  if (entry.required) {
    throw new Error(`Required model not configured: ${entry.envVar}`);
  }

  // Optional model not configured - skip
  console.warn(`${entry.envVar} not configured, skipping ${category} tasks`);
  return {
    model: null,
    category,
    skipped: true,
    reason: `${entry.envVar} not configured`
  };
}

// ===================================================
// Usage Examples
// ===================================================

// Example 1: Normal usage
const result = selectModelForTask('image_description');
if (!result.skipped) {
  // Process with result.model (gemma-3-27b)
}

// Example 2: Adding a new model category in the future
// Just add to MODEL_REGISTRY and TASK_CATEGORY_MAP:
//
// type TaskCategory = 'reasoning' | 'vision' | 'code';  // เพิ่ม 'code'
//
// TASK_CATEGORY_MAP['code_generation'] = 'code';
// TASK_CATEGORY_MAP['code_review'] = 'code';
//
// MODEL_REGISTRY['code'] = {
//   envVar: 'CODE_MODEL',
//   category: 'code',
//   required: false,
//   fallbackCategory: 'reasoning',  // fallback ไป gpt-oss-120b ได้
// };
```

---

## 📦 Chunking Strategy

### Default Configuration

```yaml
chunking:
  default_size: 512          # tokens
  default_overlap: 50        # tokens
  min_chunk_size: 100        # tokens
  max_chunk_size: 1024       # tokens
```

### Strategies per File Type

| File Type | Strategy | Reason |
|-----------|----------|--------|
| **PDF** | Semantic | Preserve paragraph boundaries, handle headers/footers |
| **DOCX** | Semantic | Use document structure (headings, paragraphs) |
| **PPTX** | Slide-based | One chunk per slide, preserve slide title as context |
| **XLSX** | Table-based | Convert tables to markdown, preserve headers |
| **Markdown** | Recursive | Split by headers (##, ###), then paragraphs |
| **TXT** | Fixed | No structure, use fixed-size chunks |
| **HTML** | Semantic | Use DOM structure, strip tags |
| **Code** | AST-based | Preserve function/class boundaries |
| **Images** | OCR + Vision | Extract text via OCR, describe diagrams via Vision API |

### Chunking Implementation

```typescript
interface ChunkingConfig {
  strategy: 'semantic' | 'recursive' | 'fixed' | 'ast';
  chunkSize: number;      // tokens
  chunkOverlap: number;   // tokens
  separators?: string[];  // for recursive strategy
}

// Default separators for recursive chunking
const RECURSIVE_SEPARATORS = [
  '\n## ',      // H2 headers
  '\n### ',     // H3 headers
  '\n\n',       // Paragraphs
  '\n',         // Lines
  '. ',         // Sentences
  ' ',          // Words
];
```

### Chunk Metadata

แต่ละ chunk จะเก็บ metadata:
```typescript
interface ChunkMetadata {
  document_id: string;
  chunk_index: number;
  start_pos: number;
  end_pos: number;
  page_number?: number;    // for PDF
  section?: string;        // heading/section name
  token_count: number;
}
```

---

## 🖼️ Image & OCR Processing

### Image Extraction from Documents

รูปภาพจะถูกดึงออกจากเอกสารเพื่อ process แยก:

```typescript
interface ImageExtractionConfig {
  // Extract images from these document types
  supportedFormats: ['pdf', 'docx', 'pptx'];

  // Minimum image size to process (skip icons/bullets)
  minWidth: 100;   // pixels
  minHeight: 100;  // pixels

  // Maximum images per document
  maxImagesPerDoc: 50;

  // Output format for extracted images
  outputFormat: 'png';
}
```

### OCR Processing (Tesseract)

```typescript
interface OCRConfig {
  engine: 'tesseract';
  languages: ['tha', 'eng'];  // Thai + English

  // Pre-processing options
  preprocessing: {
    deskew: true,           // Fix tilted scans
    denoise: true,          // Remove noise
    threshold: 'adaptive',  // Binarization method
  };

  // OCR confidence threshold
  minConfidence: 0.6;
}

// OCR result structure
interface OCRResult {
  text: string;
  confidence: number;
  boundingBoxes?: BoundingBox[];  // For highlighting in UI
}
```

### Vision API for Diagrams

สำหรับรูป diagrams/charts ที่ OCR ไม่สามารถอ่านได้:

```typescript
interface VisionConfig {
  // Model from environment variable (see Model Configuration Reference)
  model: string;  // process.env.IMAGE_DESCRIPTION_MODEL ?? skip vision processing

  // Prompt for diagram description
  diagramPrompt: string;

  // When to use Vision API vs OCR (boundary conditions are exclusive: < not <=)
  useVisionWhen: {
    lowOCRConfidence: boolean;    // OCR confidence < 0.6 (exclusive)
    detectsDiagram: boolean;      // Image classification detects diagram
    hasMinimalText: boolean;      // OCR returns < 20 characters (exclusive)
  };

  // Thresholds (explicit for clarity)
  thresholds: {
    ocrConfidence: number;        // default: 0.6
    minTextLength: number;        // default: 20
  };
}

// Default configuration
const defaultVisionConfig: VisionConfig = {
  model: process.env.IMAGE_DESCRIPTION_MODEL ?? '',  // Empty = skip vision

  diagramPrompt: `
    Describe this diagram/chart in detail:
    - What type of diagram is it?
    - What are the main components?
    - What relationships or flows does it show?
    - Extract any text labels visible.
  `,

  useVisionWhen: {
    lowOCRConfidence: true,
    detectsDiagram: true,
    hasMinimalText: true,
  },

  thresholds: {
    ocrConfidence: 0.6,
    minTextLength: 20,
  },
};

// Vision processing is skipped if model not configured
function shouldProcessWithVision(config: VisionConfig): boolean {
  if (!config.model) {
    console.warn('IMAGE_DESCRIPTION_MODEL not configured, skipping vision processing');
    return false;
  }
  return true;
}
```

### Image Chunk Metadata

```typescript
interface ImageChunkMetadata extends ChunkMetadata {
  image_type: 'extracted' | 'standalone';
  source_page?: number;
  source_slide?: number;
  original_filename?: string;

  // Processing info
  ocr_confidence?: number;
  vision_processed?: boolean;

  // For UI display
  thumbnail_path?: string;
  original_dimensions?: { width: number; height: number };
}
```

### Supported Image Formats

```typescript
const SUPPORTED_IMAGE_FORMATS = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/bmp'
];

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'];
```

---

## 🗃️ Caching Strategy

### Embedding Cache (LRU)

```typescript
interface EmbeddingCache {
  maxSize: 10000;              // entries
  ttl: 24 * 60 * 60 * 1000;   // 24 hours
  storage: 'memory';           // in-memory LRU
}

// Cache key: hash of (text + model)
// Cache value: embedding vector
```

### Search Result Cache

```typescript
interface SearchCache {
  maxSize: 1000;              // entries
  ttl: 5 * 60 * 1000;        // 5 minutes
  storage: 'memory';
}

// Cache key: hash of (query + collection + top_k + rerank)
// Cache value: search results
```

### LLM Response Cache

```typescript
interface LLMCache {
  maxSize: 500;              // entries
  ttl: 60 * 60 * 1000;      // 1 hour
  storage: 'sqlite';        // persist across restarts
}

// Cached operations:
// - Document summaries (per document_id)
// - Generated tags (per document_id)
// - Generated QA pairs (per chunk_id)
```

### Cache Configuration

```yaml
cache:
  embedding:
    enabled: true
    max_size: 10000
    ttl_hours: 24
  search:
    enabled: true
    max_size: 1000
    ttl_minutes: 5
  llm:
    enabled: true
    max_size: 500
    ttl_hours: 1
```

> **Note:** ไม่มี rate limiting ตาม user requirement - ระบบรองรับ unlimited requests

---

## ⚠️ Error Handling & Response Format

### Standard API Response Format

```typescript
// Success Response
interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    latency_ms?: number;
  };
}

// Error Response
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_INVALID` | 401 | Invalid credentials |
| `AUTH_FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `FILE_TOO_LARGE` | 413 | File exceeds 500MB limit |
| `UNSUPPORTED_TYPE` | 415 | Unsupported file type |
| `QDRANT_ERROR` | 503 | Vector database error |
| `LITELLM_ERROR` | 503 | LLM service error |
| `INTERNAL_ERROR` | 500 | Internal server error |

**Vision-Specific Error Codes:**

| Code | HTTP Status | Description | Action |
|------|-------------|-------------|--------|
| `VISION_MODEL_NOT_CONFIGURED` | 200 | IMAGE_DESCRIPTION_MODEL not set | Vision skipped, continue processing |
| `VISION_MODEL_UNAVAILABLE` | 503 | Vision model endpoint unavailable | Skip vision, log warning |
| `VISION_MODEL_TIMEOUT` | 504 | Vision request timeout (>30s) | Retry once, then skip |
| `VISION_INVALID_RESPONSE` | 502 | Invalid response from vision model | Skip vision, log error |
| `IMAGE_TOO_LARGE` | 413 | Image exceeds max dimensions | Resize and retry |
| `IMAGE_CORRUPTED` | 400 | Cannot decode image file | Skip image, log warning |
| `OCR_FAILED` | 500 | OCR processing failed | Fallback to vision if configured |

> **Note**: Vision errors ไม่ทำให้ document indexing fail ทั้งหมด - ระบบจะ skip vision processing และดำเนินการต่อ

### Example Error Responses

```json
// Validation Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameter",
    "details": {
      "field": "top_k",
      "reason": "Must be between 1 and 100"
    }
  }
}

// File Too Large
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds maximum limit",
    "details": {
      "max_size": 524288000,
      "actual_size": 600000000
    }
  }
}
```

### MCP Error Handling

```typescript
// MCP tools return errors in content
{
  content: [{
    type: "text",
    text: JSON.stringify({
      error: true,
      code: "NOT_FOUND",
      message: "Document not found: doc-123"
    })
  }],
  isError: true
}
```

---

## 🔒 Security Considerations

### Input Validation

```typescript
// All inputs sanitized before processing
const sanitizeInput = {
  // Query strings: strip control characters, limit length
  query: (q: string) => q.trim().slice(0, 1000),

  // Collection names: alphanumeric + underscore only
  collection: (c: string) => c.replace(/[^a-zA-Z0-9_-]/g, ''),

  // File names: remove path traversal attempts
  filename: (f: string) => path.basename(f).replace(/\.\./g, ''),
};
```

### CORS Configuration

```typescript
// api/middleware/cors.ts
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:8080'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400  // 24 hours
};
```

### File Upload Security

```typescript
// Whitelist of allowed file types
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',  // PPTX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',          // XLSX
  'text/plain',
  'text/markdown',
  'text/html'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md', '.html'];

// File size limit: 500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Upload validation
const validateUpload = (file: Express.Multer.File) => {
  // Check MIME type
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    throw new AppError('UNSUPPORTED_TYPE', 'File type not allowed');
  }

  // Check extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError('UNSUPPORTED_TYPE', 'File extension not allowed');
  }

  // Check size
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError('FILE_TOO_LARGE', 'File exceeds 500MB limit');
  }

  // Check magic bytes (file signature)
  validateMagicBytes(file.buffer, ext);
};
```

### SQL Injection Prevention

```typescript
// All database queries use parameterized statements
// NEVER concatenate user input into SQL

// ❌ Bad
db.run(`SELECT * FROM documents WHERE id = '${userInput}'`);

// ✅ Good
db.run('SELECT * FROM documents WHERE id = ?', [userInput]);

// Using better-sqlite3 prepared statements
const stmt = db.prepare('SELECT * FROM documents WHERE collection_id = ?');
const docs = stmt.all(collectionId);
```

### Authentication Security

```typescript
// Password hashing (local auth)
import bcrypt from 'bcrypt';
const SALT_ROUNDS = 12;

const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);
const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// JWT tokens
const JWT_SECRET = process.env.JWT_SECRET; // Must be set in production
const TOKEN_EXPIRY = '8h';

// Session management
const sessionConfig = {
  name: 'rag_session',
  secret: process.env.SESSION_SECRET,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000  // 8 hours
};
```

### Security Headers

```typescript
// Using helmet middleware
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));
```

---

## 📝 Implementation Phases

### Phase 1: Core (Week 1-2)
- [ ] MCP Server with basic tools
- [ ] Qdrant + BGE-M3 integration
- [ ] REST API
- [ ] Basic Web UI (Login, Documents, Search)
- [ ] Docker Compose
- [ ] MCPO integration

### Phase 2: LLM Features (Week 3-4)
- [ ] Auto Summary & Tags
- [ ] QA Generation
- [ ] Query Enhancement
- [ ] Answer Generation (`ask` tool)
- [ ] Enhanced Search UI

### Phase 3: Knowledge Graph (Week 5-6)
- [ ] Document Linking
- [ ] Graph Visualization
- [ ] Contradiction Detection
- [ ] Gap Analysis
- [ ] Maintenance Dashboard

### Phase 4: Production Ready (Week 7-8)
- [ ] LDAP integration
- [ ] Performance optimization
- [ ] Error handling
- [ ] Logging & monitoring
- [ ] Documentation

---

## ✅ Final Checklist

| Requirement | Status |
|-------------|--------|
| MCP Server for Claude Code | ✅ Designed |
| MCPO for Open WebUI | ✅ Designed |
| Web UI for document management | ✅ Designed |
| BGE-M3 embedding | ✅ Designed |
| BGE-reranker-v2-m3 | ✅ Designed |
| gpt-oss-120b LLM features | ✅ Designed |
| 500MB file limit | ✅ Designed |
| Thai + English support | ✅ Designed |
| Local auth (dev) | ✅ Designed |
| LDAP auth (prod) | ✅ Designed |
| Docker deployment | ✅ Designed |
| Knowledge Graph | ✅ Designed |
| Analytics | ✅ Designed |

---

## 🚀 Ready to Implement!

ทุก requirements ครบถ้วนแล้ว:
- ✅ Claude Code support (MCP)
- ✅ Open WebUI support (MCPO)
- ✅ Web UI for clients
- ✅ LLM-enhanced features
- ✅ Docker deployment

**พร้อมเริ่ม implement เลยไหมครับ?**
