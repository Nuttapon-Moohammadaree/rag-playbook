#!/bin/bash
# Re-index all documents from SQLite to Qdrant
# This script gets all indexed documents and re-indexes them with force=true

API_URL="http://localhost:3004"
LOG_FILE="/tmp/reindex-$(date +%Y%m%d_%H%M%S).log"

echo "Starting re-index process at $(date)" | tee -a "$LOG_FILE"
echo "API URL: $API_URL" | tee -a "$LOG_FILE"

# Get all indexed documents
echo "Fetching indexed documents..." | tee -a "$LOG_FILE"
DOCS=$(curl -s "$API_URL/api/documents?limit=100&status=indexed" | jq -r '.data.documents[] | .filepath')

TOTAL=$(echo "$DOCS" | wc -l)
echo "Found $TOTAL documents to re-index" | tee -a "$LOG_FILE"

# Counter
SUCCESS=0
FAILED=0
COUNT=0

# Re-index each document
while IFS= read -r filepath; do
    if [ -z "$filepath" ]; then
        continue
    fi

    COUNT=$((COUNT + 1))
    echo "[$COUNT/$TOTAL] Re-indexing: $(basename "$filepath")" | tee -a "$LOG_FILE"

    # Check if file exists
    if [ ! -f "$filepath" ]; then
        echo "  SKIP: File not found" | tee -a "$LOG_FILE"
        FAILED=$((FAILED + 1))
        continue
    fi

    # Call the upload endpoint with force=true
    RESPONSE=$(curl -s -X POST "$API_URL/api/documents/upload" \
        -H "Content-Type: application/json" \
        -d "{\"filepath\": \"$filepath\", \"force\": true}" \
        --max-time 120)

    # Check result
    if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        CHUNKS=$(echo "$RESPONSE" | jq -r '.data.chunkCount // 0')
        echo "  OK: $CHUNKS chunks" | tee -a "$LOG_FILE"
        SUCCESS=$((SUCCESS + 1))
    else
        ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
        echo "  FAILED: $ERROR" | tee -a "$LOG_FILE"
        FAILED=$((FAILED + 1))
    fi

    # Small delay to avoid overwhelming the API
    sleep 0.5
done <<< "$DOCS"

echo "" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Re-index completed at $(date)" | tee -a "$LOG_FILE"
echo "Total: $TOTAL, Success: $SUCCESS, Failed: $FAILED" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE"
