# RAG MCP Server Dockerfile
FROM node:18-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/

# Create data directory
RUN mkdir -p /app/data/sqlite

# Set environment defaults
ENV NODE_ENV=production
ENV SQLITE_PATH=/app/data/sqlite/rag.db

# Run MCP server
CMD ["node", "dist/mcp/server.js"]
