# RAG MCP Server - คู่มือการใช้งาน

## สารบัญ

1. [บทนำ](#1-บทนำ)
2. [การติดตั้ง](#2-การติดตั้ง)
3. [การตั้งค่า](#3-การตั้งค่า)
4. [การใช้งาน Web UI](#4-การใช้งาน-web-ui)
5. [การใช้งานกับ Claude Code](#5-การใช้งานกับ-claude-code)
6. [REST API Reference](#6-rest-api-reference)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. บทนำ

### RAG MCP Server คืออะไร?

RAG MCP Server เป็นระบบค้นหาเอกสารแบบ Semantic Search ที่ใช้เทคนิค **Retrieval-Augmented Generation (RAG)** สำหรับการค้นหาและตอบคำถามจากเอกสารที่จัดเก็บไว้ ระบบรองรับการเชื่อมต่อกับ **Claude Code** ผ่าน Model Context Protocol (MCP)

### ความสามารถหลัก

| ความสามารถ | รายละเอียด |
|-----------|-----------|
| **รองรับหลายรูปแบบไฟล์** | PDF, DOCX, PPTX, XLSX, CSV, HTML, JSON, RTF, TXT, MD |
| **Semantic Search** | ค้นหาด้วย BGE-M3 embeddings และ Qdrant vector database |
| **Hybrid Retrieval** | ผสม Vector similarity กับ BM25 keyword search |
| **HyDE** | Hypothetical Document Embeddings สำหรับขยาย query |
| **Reranking** | ใช้ BGE-reranker-v2-m3 cross-encoder จัดอันดับผลลัพธ์ |
| **LLM Q&A** | ตอบคำถามพร้อม citation จากเอกสาร |
| **Verification** | ตรวจสอบ grounding score ของคำตอบ |

### สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────────────┐
│                    ผู้ใช้งาน (User)                              │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│    Web UI        │  │   Claude Code    │  │     REST API         │
│  (React + Vite)  │  │  (MCP Protocol)  │  │   (Hono Framework)   │
└────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘
         │                     │                       │
         └─────────────────────┼───────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Services                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Retrieval  │  │    Ask     │  │ Ingestion  │  │    LLM    │  │
│  │  Service   │  │  Service   │  │  Service   │  │ Services  │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │
└────────┼───────────────┼───────────────┼───────────────┼────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Layer                               │
│         ┌──────────────────┐       ┌──────────────────┐         │
│         │      Qdrant      │       │      SQLite      │         │
│         │  (Vector Store)  │       │    (Metadata)    │         │
│         └──────────────────┘       └──────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│                    ┌──────────────────┐                         │
│                    │     LiteLLM      │                         │
│                    │  (Embeddings +   │                         │
│                    │   Reranking +    │                         │
│                    │      LLM)        │                         │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. การติดตั้ง

### System Requirements

| รายการ | ขั้นต่ำ | แนะนำ |
|--------|--------|-------|
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 10 GB | 50 GB+ (ขึ้นอยู่กับปริมาณเอกสาร) |
| **CPU** | 2 cores | 4 cores+ |
| **Docker** | 20.10+ | ล่าสุด |
| **Docker Compose** | 2.0+ | ล่าสุด |

### Quick Start (Docker) - แนะนำ

วิธีที่ง่ายและเร็วที่สุดในการเริ่มต้น:

```bash
# 1. Clone repository
git clone https://github.com/Nuttapon-Moohammadaree/rag-playbook.git
cd rag-playbook/rag-mcp-server

# 2. สร้างไฟล์ .env จาก template
cp .env.example .env

# 3. แก้ไข .env ใส่ค่าที่จำเป็น
nano .env  # หรือ vim .env

# 4. Start services (Qdrant + MCPO)
docker compose up -d

# 5. ตรวจสอบสถานะ
docker compose ps
```

#### Services ที่จะถูก start:

| Service | Port | คำอธิบาย |
|---------|------|----------|
| `qdrant` | 6333 | Vector database สำหรับเก็บ embeddings |
| `mcpo` | 8000 | MCP-to-OpenAPI proxy สำหรับ Web UI |

### Manual Installation (สำหรับ Development)

```bash
# 1. Clone repository
git clone https://github.com/Nuttapon-Moohammadaree/rag-playbook.git
cd rag-playbook/rag-mcp-server

# 2. ติดตั้ง dependencies
npm install

# 3. สร้างไฟล์ .env
cp .env.example .env
# แก้ไขค่าใน .env ตามต้องการ

# 4. Build project
npm run build

# 5. Start Qdrant (ต้องรัน Docker)
docker compose up qdrant -d

# 6a. รันเป็น MCP server (สำหรับ Claude Code)
npm run mcp

# 6b. หรือรันเป็น REST API server
npm run start:api

# 6c. หรือรันทั้ง API และ Web UI (development)
npm run dev
```

### การ Build Web UI

```bash
cd web
npm install
npm run build  # สร้าง production build ที่ dist/
```

---

## 3. การตั้งค่า

### Environment Variables ที่สำคัญ

สร้างไฟล์ `.env` จาก `.env.example` และปรับค่าตามต้องการ:

#### ค่าที่จำเป็น (Required)

```env
# LiteLLM API - จำเป็นต้องตั้งค่า
LITELLM_API_KEY=your-api-key-here
LITELLM_BASE_URL=https://csai.ait.co.th/litellm/v1
```

#### Embedding Model

```env
# BGE-M3 multilingual embeddings
EMBEDDING_MODEL=BAAI/bge-m3
VECTOR_SIZE=1024
```

#### Qdrant Configuration

```env
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=rag_documents
```

#### Chunking Configuration

```env
# ขนาดของ text chunk (ตัวอักษร)
CHUNK_SIZE=512
CHUNK_OVERLAP=50
MIN_CHUNK_SIZE=100
```

#### Search Configuration

```env
# ค่า default สำหรับการค้นหา
SEARCH_LIMIT=10
SEARCH_THRESHOLD=0.5
```

#### Reranking Configuration

```env
# Cross-encoder reranking
RERANKING_ENABLED=true
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANK_TOP_N=5
RERANK_CANDIDATES=4
```

#### LLM Configuration

```env
# Model สำหรับตอบคำถาม
LLM_MODEL=gpt-oss-120b
QUERY_EXPANSION=true

# Auto features (ใช้ LLM เพิ่ม)
AUTO_SUMMARY=false
AUTO_TAGS=false
HYDE_ENABLED=false
```

#### Verification Pipeline

```env
# ตรวจสอบความถูกต้องของคำตอบ
VERIFICATION_ENABLED=false
VERIFICATION_RELEVANCE_THRESHOLD=0.6
VERIFICATION_GROUNDING_THRESHOLD=0.7
```

#### REST API Configuration

```env
API_PORT=3001
API_HOST=0.0.0.0
```

### การเชื่อมต่อ LiteLLM

ระบบใช้ LiteLLM เป็น unified API สำหรับ:
- **Embeddings** - สร้าง vector จากข้อความ (BGE-M3)
- **Reranking** - จัดอันดับผลลัพธ์ (BGE-reranker-v2-m3)
- **LLM** - ตอบคำถามและวิเคราะห์ (GPT-oss-120b หรือ model อื่น)

```env
# ตัวอย่างการใช้ LiteLLM service ภายใน
LITELLM_BASE_URL=https://csai.ait.co.th/litellm/v1
LITELLM_API_KEY=your-key
```

### การเชื่อมต่อ Qdrant

Qdrant เป็น vector database สำหรับเก็บ embeddings:

```env
# Local Qdrant (Docker)
QDRANT_URL=http://localhost:6333

# หรือ Qdrant Cloud
QDRANT_URL=https://your-cluster.qdrant.cloud
QDRANT_API_KEY=your-qdrant-api-key
```

---

## 4. การใช้งาน Web UI

Web UI เข้าถึงได้ที่ `http://localhost:3001` (เมื่อรัน API server)

### 4.1 Dashboard - ภาพรวมระบบ

หน้า Dashboard แสดงข้อมูลสรุปของระบบ:

- **จำนวนเอกสารทั้งหมด** - เอกสารที่ถูก index แล้ว
- **จำนวน Collections** - กลุ่มเอกสาร
- **สถิติการค้นหา** - จำนวน queries ล่าสุด
- **สถานะระบบ** - Qdrant, LiteLLM connection status

### 4.2 Documents - จัดการเอกสาร

หน้าจัดการเอกสารที่ถูก index:

#### การ Index เอกสารใหม่

1. คลิกปุ่ม **"Upload Document"**
2. ระบุ path ของไฟล์บน server (เช่น `/documents/report.pdf`)
3. ตั้งค่า chunking (optional):
   - **Chunk Size** - ขนาด chunk (default: 512)
   - **Chunk Overlap** - overlap ระหว่าง chunks (default: 50)
4. คลิก **"Index"**

#### ไฟล์ที่รองรับ

| ประเภท | นามสกุลไฟล์ | หมายเหตุ |
|--------|------------|----------|
| PDF | `.pdf` | รองรับ text-based PDFs |
| Word | `.docx` | Microsoft Word 2007+ |
| PowerPoint | `.pptx` | Microsoft PowerPoint 2007+ |
| Excel | `.xlsx`, `.xls` | Spreadsheet data |
| CSV | `.csv` | Comma-separated values |
| HTML | `.html`, `.htm` | Web pages |
| JSON | `.json` | Structured data |
| RTF | `.rtf` | Rich Text Format |
| Text | `.txt`, `.md` | Plain text, Markdown |

#### การดูรายละเอียดเอกสาร

- คลิกที่ชื่อเอกสารเพื่อดูรายละเอียด
- แสดง: filename, file type, size, chunk count, status, created date

#### การลบเอกสาร

1. คลิกปุ่ม delete (ถังขยะ) ข้างเอกสาร
2. ยืนยันการลบ
3. เอกสารและ chunks จะถูกลบออกจากระบบ

### 4.3 Collections - จัดกลุ่มเอกสาร

Collections ช่วยจัดกลุ่มเอกสารที่เกี่ยวข้องกัน:

#### การสร้าง Collection

1. คลิก **"New Collection"**
2. ระบุ:
   - **Name** - ชื่อ collection (ต้องไม่ซ้ำ)
   - **Description** - คำอธิบาย (optional)
   - **Color** - สีสำหรับแสดงผล (optional)
3. คลิก **"Create"**

#### การเพิ่มเอกสารเข้า Collection

1. เปิด Collection ที่ต้องการ
2. คลิก **"Add Documents"**
3. เลือกเอกสารจากรายการ
4. คลิก **"Add"**

#### การลบเอกสารออกจาก Collection

- คลิกปุ่ม remove ข้างเอกสารใน collection
- เอกสารจะถูกนำออกจาก collection แต่ไม่ถูกลบจากระบบ

### 4.4 Search - ค้นหาเอกสาร

หน้าค้นหาแบบ Semantic Search:

#### วิธีการค้นหา

1. พิมพ์คำค้นหาในช่อง search
2. ตั้งค่า options (optional):
   - **Limit** - จำนวนผลลัพธ์สูงสุด (1-50)
   - **Threshold** - คะแนน similarity ขั้นต่ำ (0-1)
   - **Rerank** - เปิด/ปิด cross-encoder reranking
   - **HyDE** - เปิด/ปิด Hypothetical Document Embeddings
3. คลิก **"Search"** หรือกด Enter

#### ผลลัพธ์การค้นหา

แต่ละผลลัพธ์แสดง:
- **Content** - เนื้อหา chunk ที่ตรงกับ query
- **Score** - คะแนน similarity (0-1)
- **Source** - ไฟล์ต้นทางและ metadata

### 4.5 Ask - ถาม-ตอบ

หน้าถาม-ตอบใช้ RAG:

#### วิธีการถามคำถาม

1. พิมพ์คำถามในช่อง input
2. ตั้งค่า options (optional):
   - **Limit** - จำนวน context chunks (1-20)
   - **Model** - LLM model ที่ใช้
   - **Rerank** - เปิด/ปิด reranking
   - **Verify** - เปิด/ปิด verification pipeline
3. คลิก **"Ask"** หรือกด Enter

#### ผลลัพธ์

- **Answer** - คำตอบที่สร้างจาก LLM
- **Sources** - เอกสารที่ใช้เป็นแหล่งข้อมูล
- **Confidence** - คะแนนความมั่นใจ (ถ้าเปิด verify)
- **Citations** - อ้างอิงจากเอกสาร

### 4.6 Analytics - สถิติการใช้งาน

หน้าแสดงสถิติและ metrics:

#### Query Statistics

- **Total Queries** - จำนวน queries ทั้งหมด
- **Search vs Ask** - สัดส่วนการค้นหา vs ถาม-ตอบ
- **Average Latency** - เวลาตอบสนองเฉลี่ย
- **Queries Last 24h/7d** - queries ช่วง 24 ชม. / 7 วัน

#### Query Trends

- กราฟแสดงแนวโน้มการใช้งานรายวัน
- แยกตาม search และ ask

#### Top Queries

- รายการ queries ที่ถูกใช้บ่อยที่สุด
- รวม count และ average latency

### 4.7 Settings - ตั้งค่า

หน้าตั้งค่าระบบ (ถ้ามี):

- ดู/แก้ไข configuration
- จัดการ connection settings
- ตรวจสอบ system status

---

## 5. การใช้งานกับ Claude Code

### การ config MCP server

เพิ่ม RAG MCP Server ในไฟล์ Claude Code configuration:

#### ตำแหน่งไฟล์ config:
- **macOS**: `~/.claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### ตัวอย่าง Configuration:

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/rag-mcp-server/dist/mcp/server.js"],
      "env": {
        "LITELLM_API_KEY": "your-api-key",
        "LITELLM_BASE_URL": "https://csai.ait.co.th/litellm/v1",
        "QDRANT_URL": "http://localhost:6333",
        "EMBEDDING_MODEL": "BAAI/bge-m3",
        "RERANKER_MODEL": "BAAI/bge-reranker-v2-m3",
        "LLM_MODEL": "gpt-oss-120b"
      }
    }
  }
}
```

### MCP Tools ที่มี (8 tools)

#### 1. `index_document`
Index ไฟล์เอกสารเข้าสู่ระบบ

```typescript
// Parameters
{
  filepath: string,      // path ของไฟล์ (required)
  chunkSize?: number,    // ขนาด chunk (default: 512)
  chunkOverlap?: number, // overlap (default: 50)
  metadata?: object      // metadata เพิ่มเติม
}

// ตัวอย่างการใช้
"Index the document at /documents/project-spec.pdf"
```

#### 2. `index_text`
Index ข้อความโดยตรงโดยไม่ต้องมีไฟล์

```typescript
// Parameters
{
  content: string,       // ข้อความที่ต้องการ index (required)
  title: string,         // ชื่อเอกสาร (required)
  metadata?: object      // metadata เพิ่มเติม
}

// ตัวอย่างการใช้
"Index this text as 'Meeting Notes': [paste text]"
```

#### 3. `list_documents`
แสดงรายการเอกสารที่ถูก index

```typescript
// Parameters
{
  status?: string,       // filter: pending, processing, indexed, failed
  fileType?: string      // filter: pdf, docx, txt, etc.
}

// ตัวอย่างการใช้
"List all indexed PDF documents"
```

#### 4. `get_document`
ดูรายละเอียดเอกสารจาก ID

```typescript
// Parameters
{
  documentId: string     // UUID ของเอกสาร (required)
}

// ตัวอย่างการใช้
"Get details of document abc-123-def"
```

#### 5. `delete_document`
ลบเอกสารออกจากระบบ

```typescript
// Parameters
{
  documentId: string     // UUID ของเอกสาร (required)
}

// ตัวอย่างการใช้
"Delete the document with ID abc-123-def"
```

#### 6. `search`
ค้นหาเอกสารแบบ semantic search

```typescript
// Parameters
{
  query: string,         // คำค้นหา (required)
  limit?: number,        // จำนวนผลลัพธ์ (default: 10)
  threshold?: number,    // คะแนนขั้นต่ำ 0-1 (default: 0.5)
  rerank?: boolean,      // ใช้ reranking (default: true)
  expand?: boolean,      // ขยาย query (default: false)
  hyde?: boolean         // ใช้ HyDE (default: false)
}

// ตัวอย่างการใช้
"Search for documents about authentication flow"
```

#### 7. `ask`
ถามคำถามและรับคำตอบจากเอกสาร

```typescript
// Parameters
{
  question: string,      // คำถาม (required)
  limit?: number,        // จำนวน context chunks (default: 5)
  threshold?: number,    // คะแนนขั้นต่ำ (default: 0.5)
  rerank?: boolean,      // ใช้ reranking (default: true)
  verify?: boolean       // ตรวจสอบคำตอบ (default: false)
}

// ตัวอย่างการใช้
"What is the authentication process in this project?"
```

#### 8. `summarize_document`
สร้างสรุปเอกสาร

```typescript
// Parameters
{
  documentId: string,    // UUID ของเอกสาร (required)
  style?: string         // brief, detailed, bullet_points (default: brief)
}

// ตัวอย่างการใช้
"Summarize document abc-123 in bullet points"
```

### ตัวอย่างการใช้งานกับ Claude Code

#### Scenario 1: Index และค้นหาเอกสาร

```
User: Index all PDF files in /documents/specs folder

Claude: I'll index the PDF files for you.
[Uses index_document tool for each file]

User: Search for information about API authentication

Claude: [Uses search tool]
Found 5 relevant chunks about authentication:
1. "The API uses JWT tokens for authentication..." (score: 0.92)
2. ...
```

#### Scenario 2: ถามคำถามเกี่ยวกับโปรเจค

```
User: What are the main components of this system?

Claude: [Uses ask tool]
Based on the indexed documents, the main components are:
1. Frontend - React application with Vite
2. Backend - Hono API server
3. Storage - Qdrant vector DB + SQLite
...
Sources: architecture.md, readme.md
```

#### Scenario 3: สรุปเอกสาร

```
User: Summarize the project specification document

Claude: [Uses summarize_document tool]
Brief summary:
The project implements a RAG system for semantic document search
with support for multiple file formats and LLM-powered Q&A...
```

---

## 6. REST API Reference

Base URL: `http://localhost:3001/api`

### Health Check

```http
GET /health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-21T10:00:00Z",
    "version": "1.0.0"
  }
}
```

### Documents

#### List Documents

```http
GET /documents?limit=20&offset=0&status=indexed&fileType=pdf
```

#### Get Document by ID

```http
GET /documents/{id}
```

#### Index Document

```http
POST /documents/upload
Content-Type: application/json

{
  "filepath": "/documents/report.pdf",
  "chunkSize": 512,
  "chunkOverlap": 50,
  "metadata": {
    "project": "my-project"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "documentId": "uuid-here",
    "filename": "report.pdf",
    "status": "indexed",
    "chunkCount": 25,
    "message": "Document indexed successfully"
  }
}
```

#### Delete Document

```http
DELETE /documents/{id}
```

### Search

```http
POST /search
Content-Type: application/json

{
  "query": "authentication flow",
  "limit": 10,
  "threshold": 0.5,
  "rerank": true,
  "expand": false,
  "hyde": false,
  "filters": {
    "fileTypes": ["pdf", "docx"],
    "documentIds": ["uuid-1", "uuid-2"]
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "chunkId": "chunk-uuid",
        "documentId": "doc-uuid",
        "content": "The authentication uses JWT...",
        "score": 0.92,
        "document": {
          "filename": "auth.md",
          "filepath": "/docs/auth.md",
          "fileType": "md"
        }
      }
    ],
    "metadata": {
      "query": "authentication flow",
      "rerankUsed": true,
      "hydeUsed": false,
      "totalResults": 5
    }
  }
}
```

### Ask (Q&A)

```http
POST /ask
Content-Type: application/json

{
  "question": "How does authentication work?",
  "limit": 5,
  "threshold": 0.5,
  "model": "gpt-oss-120b",
  "rerank": true,
  "verify": false
}
```

Response:
```json
{
  "success": true,
  "data": {
    "answer": "Authentication in this system uses JWT tokens...",
    "sources": [
      {
        "filename": "auth.md",
        "filepath": "/docs/auth.md",
        "content": "JWT implementation...",
        "score": 0.92
      }
    ],
    "model": "gpt-oss-120b",
    "usage": {
      "llm": {
        "promptTokens": 500,
        "completionTokens": 150,
        "totalTokens": 650
      }
    },
    "metadata": {
      "question": "How does authentication work?",
      "rerankUsed": true
    }
  }
}
```

### Collections

#### List Collections

```http
GET /collections
```

#### Create Collection

```http
POST /collections
Content-Type: application/json

{
  "name": "Project Docs",
  "description": "Documentation for project X",
  "color": "#6366f1"
}
```

#### Get Collection

```http
GET /collections/{id}
```

#### Update Collection

```http
PUT /collections/{id}
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

#### Delete Collection

```http
DELETE /collections/{id}
```

#### Get Collection Documents

```http
GET /collections/{id}/documents
```

#### Add Document to Collection

```http
POST /collections/{id}/documents
Content-Type: application/json

{
  "documentId": "doc-uuid"
}
```

#### Remove Document from Collection

```http
DELETE /collections/{id}/documents/{documentId}
```

### Analytics

#### Get Query Statistics

```http
GET /analytics/stats
```

#### Get Query Trends

```http
GET /analytics/trends?days=7
```

#### Get Top Queries

```http
GET /analytics/top-queries?limit=10&type=search
```

#### Get Recent Queries

```http
GET /analytics/queries?limit=100&type=ask
```

---

## 7. Troubleshooting

### ปัญหาที่พบบ่อย

#### 1. ไม่สามารถเชื่อมต่อ Qdrant

**อาการ:** Error "Connection refused" หรือ "ECONNREFUSED"

**สาเหตุและวิธีแก้:**

```bash
# ตรวจสอบว่า Qdrant กำลังทำงาน
docker ps | grep qdrant

# ถ้าไม่ทำงาน ให้ start
docker compose up qdrant -d

# ตรวจสอบ logs
docker compose logs qdrant

# ตรวจสอบว่า port 6333 เปิดอยู่
curl http://localhost:6333/health
```

#### 2. ไม่สามารถสร้าง embeddings

**อาการ:** Error เกี่ยวกับ embedding หรือ LiteLLM

**สาเหตุและวิธีแก้:**

```bash
# ตรวจสอบ environment variables
echo $LITELLM_API_KEY
echo $LITELLM_BASE_URL

# ทดสอบ connection กับ LiteLLM
curl -X POST "$LITELLM_BASE_URL/embeddings" \
  -H "Authorization: Bearer $LITELLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "BAAI/bge-m3", "input": "test"}'
```

#### 3. การ index เอกสารล้มเหลว

**อาการ:** Document status เป็น "failed"

**สาเหตุและวิธีแก้:**

1. **ไฟล์ไม่พบ:** ตรวจสอบ path ว่าถูกต้อง
2. **ไฟล์ format ไม่รองรับ:** ใช้เฉพาะ formats ที่รองรับ
3. **ไฟล์เสียหาย:** ลองเปิดไฟล์ด้วยโปรแกรมอื่นก่อน
4. **Memory ไม่พอ:** สำหรับไฟล์ใหญ่ อาจต้องเพิ่ม memory

```bash
# ดู logs ของ API server
docker compose logs rag-mcp

# หรือถ้ารัน locally
npm run dev 2>&1 | tee app.log
```

#### 4. ผลลัพธ์การค้นหาไม่ดี

**อาการ:** ค้นหาแล้วได้ผลลัพธ์ไม่ตรงกับที่ต้องการ

**วิธีปรับปรุง:**

1. **ลด threshold:** ลดค่า `threshold` จาก 0.5 เป็น 0.3
2. **เปิด reranking:** ตั้ง `rerank: true`
3. **เปิด HyDE:** ตั้ง `hyde: true` (ใช้ LLM เพิ่ม)
4. **เพิ่ม limit:** เพิ่มจำนวน candidates ก่อน rerank

```json
{
  "query": "your query",
  "limit": 20,
  "threshold": 0.3,
  "rerank": true,
  "hyde": true
}
```

#### 5. MCP Server ไม่ตอบสนอง

**อาการ:** Claude Code ไม่สามารถใช้ RAG tools

**สาเหตุและวิธีแก้:**

1. **ตรวจสอบ config path:**
```bash
# ตรวจสอบว่า path ถูกต้อง
ls -la /path/to/rag-mcp-server/dist/mcp/server.js
```

2. **ตรวจสอบ build:**
```bash
cd /path/to/rag-mcp-server
npm run build
```

3. **ทดสอบ MCP server โดยตรง:**
```bash
node dist/mcp/server.js
# ควรเห็น "rag-mcp-server v1.0.0 started" ใน stderr
```

4. **ตรวจสอบ environment variables ใน config**

#### 6. Memory สูงมาก

**อาการ:** RAM ถูกใช้มากผิดปกติ

**วิธีแก้:**

1. **จำกัด Qdrant memory:**
```yaml
# docker-compose.yml
services:
  qdrant:
    deploy:
      resources:
        limits:
          memory: 2G
```

2. **ลด chunk size:** ใช้ `CHUNK_SIZE=256` แทน 512
3. **ลบเอกสารที่ไม่ใช้:** ใช้ `delete_document` tool

#### 7. API Timeout

**อาการ:** Request หมดเวลา โดยเฉพาะ /ask endpoint

**วิธีแก้:**

```env
# เพิ่ม timeout ใน .env
LITELLM_TIMEOUT=60000  # 60 วินาที
```

### การดู Logs

```bash
# Docker logs
docker compose logs -f

# Qdrant logs
docker compose logs qdrant

# API logs (development)
npm run dev 2>&1 | tee debug.log
```

### การ Reset ระบบ

```bash
# ลบ data ทั้งหมดและเริ่มใหม่
docker compose down -v
rm -rf data/
docker compose up -d
```

---

## ข้อมูลเพิ่มเติม

- **Repository:** https://github.com/Nuttapon-Moohammadaree/rag-playbook
- **MCP Protocol:** https://modelcontextprotocol.io/
- **Qdrant:** https://qdrant.tech/
- **LiteLLM:** https://litellm.ai/
- **BGE-M3:** https://huggingface.co/BAAI/bge-m3

---

*คู่มือนี้สร้างสำหรับ RAG MCP Server v1.0.0*
