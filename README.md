# RAG Playbook

[English](#english) | [ภาษาไทย](#ภาษาไทย)

---

## English

A comprehensive collection of RAG (Retrieval-Augmented Generation) implementations and tools for building AI-powered document search and question-answering systems.

### Projects

#### [RAG MCP Server](./rag-mcp-server/)

Production-ready RAG server implementing the Model Context Protocol (MCP) for seamless integration with Claude Code and other MCP-compatible AI assistants.

**Key Features:**
- **Multi-format Document Support**: PDF, DOCX, PPTX, XLSX, CSV, HTML, JSON, RTF, TXT
- **Semantic Search**: BGE-M3 multilingual embeddings with Qdrant vector database
- **Hybrid Retrieval**: Vector similarity + BM25 keyword search with Reciprocal Rank Fusion (RRF)
- **LLM-powered Enhancements**:
  - HyDE (Hypothetical Document Embeddings) for query expansion
  - Query enhancement and rewriting
  - Auto-summarization and tagging
  - Cross-encoder reranking
- **Security Hardened**: Path traversal protection, rate limiting, input validation, UUID validation
- **Production Ready**: 529+ automated tests, comprehensive error handling

### Quick Start

```bash
# Clone repository
git clone https://github.com/Nuttapon-Moohammadaree/rag-playbook.git
cd rag-playbook/rag-mcp-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Build and run
npm run build
npm run mcp
```

### Integration with Claude Code

Add to your MCP configuration (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/rag-mcp-server/dist/mcp/server.js"],
      "env": {
        "LITELLM_API_KEY": "your-api-key",
        "LITELLM_BASE_URL": "http://localhost:4000/v1",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

### MCP Tools Reference

| Tool | Description | Parameters |
|------|-------------|------------|
| `rag_search` | Semantic search across documents | `query`, `limit`, `threshold`, `fileTypes`, `useHyde`, `useReranking` |
| `rag_ask` | Answer questions with context | `question`, `limit`, `useHyde`, `useReranking` |
| `rag_index_document` | Index file from path | `path`, `force` |
| `rag_index_text` | Index raw text | `content`, `title`, `metadata` |
| `rag_list_documents` | List indexed documents | `status`, `fileType` |
| `rag_delete_document` | Delete by ID | `documentId` |
| `rag_enhance_query` | LLM query enhancement | `query`, `method` |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code / MCP Client                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       MCP Server Layer                       │
│    search │ ask │ documents │ llm-enhance                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Core Services                         │
│  Retrieval │ Ask │ Ingestion │ Chunking │ Embedding │ LLM   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Storage Layer                           │
│              Qdrant (Vectors) │ SQLite (Metadata)           │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ / Bun |
| Language | TypeScript |
| Vector Database | Qdrant |
| Metadata Storage | SQLite (better-sqlite3) |
| Embeddings | BGE-M3 via LiteLLM |
| Protocol | Model Context Protocol (MCP) |
| Testing | Vitest (529+ tests) |
| Validation | Zod |

---

## ภาษาไทย

คอลเลกชันเครื่องมือ RAG (Retrieval-Augmented Generation) สำหรับสร้างระบบค้นหาเอกสารและตอบคำถามด้วย AI

### โปรเจกต์หลัก

#### [RAG MCP Server](./rag-mcp-server/)

เซิร์ฟเวอร์ RAG ระดับ Production ที่ implement Model Context Protocol (MCP) สำหรับใช้งานร่วมกับ Claude Code และ AI assistants อื่นๆ ที่รองรับ MCP

**ฟีเจอร์หลัก:**

- **รองรับเอกสารหลายรูปแบบ**: PDF, DOCX, PPTX, XLSX, CSV, HTML, JSON, RTF, TXT
- **ค้นหาเชิงความหมาย (Semantic Search)**: ใช้ BGE-M3 embeddings ที่รองรับหลายภาษา + Qdrant vector database
- **Hybrid Retrieval**: ผสมผสาน Vector similarity + BM25 keyword search ด้วย Reciprocal Rank Fusion (RRF)
- **เสริมด้วย LLM**:
  - HyDE (Hypothetical Document Embeddings) สำหรับขยาย query
  - ปรับปรุงและเขียน query ใหม่
  - สรุปเอกสารอัตโนมัติ
  - จัดอันดับผลลัพธ์ใหม่ด้วย Cross-encoder
- **ความปลอดภัย**: ป้องกัน Path traversal, Rate limiting, ตรวจสอบ Input, ตรวจสอบ UUID
- **พร้อมใช้งาน Production**: มี 529+ automated tests

### วิธีติดตั้ง

#### ความต้องการเบื้องต้น

- Node.js 18+ หรือ Bun
- Qdrant vector database (รันด้วย Docker หรือ Cloud)
- LiteLLM-compatible API endpoint (สำหรับ embeddings และ LLM)

#### ขั้นตอนการติดตั้ง

```bash
# 1. Clone repository
git clone https://github.com/Nuttapon-Moohammadaree/rag-playbook.git
cd rag-playbook/rag-mcp-server

# 2. ติดตั้ง dependencies
npm install

# 3. คัดลอกไฟล์ config
cp .env.example .env

# 4. แก้ไขไฟล์ .env ตามการตั้งค่าของคุณ
nano .env

# 5. Build โปรเจกต์
npm run build

# 6. รันเซิร์ฟเวอร์
npm run mcp
```

#### ตัวอย่างการตั้งค่า .env

```env
# LiteLLM API Configuration
LITELLM_API_KEY=your-api-key-here
LITELLM_BASE_URL=http://localhost:4000/v1

# Embedding Model
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024

# Qdrant Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=documents

# LLM Features (ตั้งเป็น true เพื่อเปิดใช้งาน)
LLM_MODEL=gpt-4o-mini
AUTO_SUMMARY=false
AUTO_TAGS=false
HYDE_ENABLED=false
RERANKING_ENABLED=false

# Storage Path
SQLITE_PATH=./data/rag.db
```

### การใช้งานกับ Claude Code

เพิ่มการตั้งค่าใน MCP configuration (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/rag-mcp-server/dist/mcp/server.js"],
      "env": {
        "LITELLM_API_KEY": "your-api-key",
        "LITELLM_BASE_URL": "http://localhost:4000/v1",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

หลังจากตั้งค่าแล้ว Claude Code จะสามารถใช้คำสั่งเหล่านี้ได้:

### คำสั่ง MCP Tools

#### 1. `rag_search` - ค้นหาเอกสาร

ค้นหาเอกสารด้วย semantic search

```
ค้นหาเอกสารเกี่ยวกับ "วิธีการตั้งค่า Docker"
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `query` | string | คำค้นหา (จำเป็น) |
| `limit` | number | จำนวนผลลัพธ์สูงสุด (ค่าเริ่มต้น: 10) |
| `threshold` | number | คะแนนความคล้ายขั้นต่ำ 0-1 (ค่าเริ่มต้น: 0.5) |
| `fileTypes` | string[] | กรองตามประเภทไฟล์ เช่น ["pdf", "docx"] |
| `useHyde` | boolean | เปิดใช้ HyDE query expansion |
| `useReranking` | boolean | เปิดใช้การจัดอันดับใหม่ |

#### 2. `rag_ask` - ถามคำถาม

ถามคำถามและรับคำตอบจาก context ที่ค้นหาได้

```
ถามคำถาม: "Docker Compose ใช้ยังไง?"
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `question` | string | คำถาม (จำเป็น) |
| `limit` | number | จำนวน chunks ที่ใช้เป็น context |
| `useHyde` | boolean | เปิดใช้ HyDE |
| `useReranking` | boolean | เปิดใช้การจัดอันดับใหม่ |

#### 3. `rag_index_document` - Index เอกสารจากไฟล์

```
Index ไฟล์ /path/to/document.pdf
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `path` | string | พาธไฟล์ (จำเป็น) |
| `force` | boolean | บังคับ reindex แม้มีอยู่แล้ว |

#### 4. `rag_index_text` - Index ข้อความ

```
Index ข้อความนี้เป็นเอกสารชื่อ "บันทึกการประชุม"
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `content` | string | เนื้อหาข้อความ (จำเป็น) |
| `title` | string | ชื่อเอกสาร (จำเป็น) |
| `metadata` | object | metadata เพิ่มเติม |

#### 5. `rag_list_documents` - แสดงรายการเอกสาร

```
แสดงเอกสารทั้งหมดที่ index แล้ว
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `status` | string | กรองตามสถานะ: indexed, processing, failed |
| `fileType` | string | กรองตามประเภทไฟล์ |

#### 6. `rag_delete_document` - ลบเอกสาร

```
ลบเอกสาร ID: abc-123-def
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `documentId` | string | UUID ของเอกสาร (จำเป็น) |

#### 7. `rag_enhance_query` - ปรับปรุง Query

```
ปรับปรุง query "docker" ให้ดีขึ้น
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `query` | string | query เดิม (จำเป็น) |
| `method` | string | วิธีการ: expand, rewrite, both |

### รูปแบบไฟล์ที่รองรับ

| ประเภท | นามสกุล | Parser ที่ใช้ |
|--------|---------|--------------|
| PDF | `.pdf` | pdf-parse |
| Word | `.docx` | mammoth |
| PowerPoint | `.pptx` | officeparser |
| Excel | `.xlsx`, `.xls` | xlsx |
| CSV | `.csv` | built-in |
| HTML | `.html`, `.htm` | cheerio |
| JSON | `.json` | built-in |
| RTF | `.rtf` | built-in |
| Text | `.txt`, `.md` | built-in |

### โครงสร้างโปรเจกต์

```
rag-playbook/
├── rag-mcp-server/              # RAG MCP Server หลัก
│   ├── src/
│   │   ├── config/              # การตั้งค่า
│   │   ├── core/
│   │   │   ├── ask/             # บริการตอบคำถาม
│   │   │   ├── chunking/        # แบ่งข้อความเป็น chunks
│   │   │   ├── embedding/       # สร้าง embeddings
│   │   │   ├── ingestion/       # นำเข้าเอกสาร
│   │   │   │   └── parsers/     # ตัวแปลงไฟล์แต่ละประเภท
│   │   │   ├── llm/             # บริการ LLM (HyDE, summarizer)
│   │   │   ├── reranking/       # จัดอันดับผลลัพธ์ใหม่
│   │   │   └── retrieval/       # ค้นหาและดึงข้อมูล
│   │   ├── mcp/
│   │   │   ├── server.ts        # MCP server หลัก
│   │   │   └── tools/           # MCP tools แต่ละตัว
│   │   ├── storage/
│   │   │   ├── qdrant.ts        # เก็บ vectors
│   │   │   └── sqlite.ts        # เก็บ metadata
│   │   ├── types/               # TypeScript definitions
│   │   └── utils/               # utilities (security, cache)
│   ├── .env.example             # ตัวอย่างการตั้งค่า
│   ├── package.json
│   └── README.md                # เอกสารละเอียด
├── rag-mcp-complete-design.md   # เอกสารออกแบบต้นฉบับ
├── CLAUDE.md                    # การตั้งค่า Claude Code
└── README.md                    # ไฟล์นี้
```

### ฟีเจอร์ความปลอดภัย

| ฟีเจอร์ | คำอธิบาย |
|--------|----------|
| **Path Traversal Protection** | ตรวจสอบและ canonicalize paths ทุกครั้ง ป้องกันการเข้าถึงไฟล์นอก scope |
| **Rate Limiting** | จำกัดจำนวน requests ต่อช่วงเวลา ป้องกัน DoS |
| **Input Validation** | ตรวจสอบ input ทั้งหมดด้วย Zod schemas |
| **UUID Validation** | Document IDs ต้องเป็น UUID ที่ถูกต้อง |
| **Error Sanitization** | ซ่อน internal errors ไม่ให้ client เห็น |
| **Document Locking** | ป้องกัน race condition ตอน index พร้อมกัน |
| **Size Limits** | จำกัดขนาด content และ metadata |

### การพัฒนา

```bash
cd rag-mcp-server

# รัน tests ทั้งหมด
npm test

# รัน tests พร้อม coverage
npm run test:coverage

# ตรวจสอบ TypeScript
npx tsc --noEmit

# Development mode (auto-rebuild)
npm run dev
```

### สถิติ Tests

- **จำนวน Tests**: 529+
- **Test Files**: 23
- **Coverage Areas**:
  - Core services (ingestion, retrieval, ask)
  - Parsers (PDF, DOCX, PPTX, etc.)
  - Storage (SQLite, Qdrant)
  - MCP tools
  - Security utilities

---

## License

MIT

## Author

Nuttapon Moohammadaree

## Contributing

1. Fork repository
2. สร้าง feature branch (`git checkout -b feature/amazing-feature`)
3. Commit การเปลี่ยนแปลง (`git commit -m 'Add amazing feature'`)
4. Push ไปยัง branch (`git push origin feature/amazing-feature`)
5. เปิด Pull Request
