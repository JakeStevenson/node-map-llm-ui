# Node Map LLM UI - Development Guide

## Project Overview

Visual conversation tree interface for LLMs with DAG-based conversation branching, merging, and context management.

## Architecture

### Key Features Implemented

#### Context Management
- **Token counting**: Character-based estimation (~3.5 chars per token) with caching on nodes
- **Visual indicators**: Context percentage badges on nodes and in sidebar (60%+ threshold)
  - Green: 0-79%, Yellow: 80-94%, Red: 95%+
- **Auto-summarization**: Right-click nodes → "Summarize up to here" to compress conversation history
- **Node deletion**: Right-click to delete nodes (warns for branch deletion)
- **Model auto-detection**: Context limits detected for Llama, Mistral, Qwen, CodeLlama, etc.
- **Performance optimizations**: Token caching, memoized calculations, debounced UI (150ms)

#### Markdown Rendering
- **Formatted content**: Nodes render markdown instead of raw syntax (bold, italic, code, lists, etc.)
- **Compact styling**: Custom component optimized for small node displays
- **Interactive links**: Clickable links that open in new tabs without triggering node selection

#### Node Types
1. **ConversationNode** - Regular user/assistant messages (~220px width)
   - Green 📎 badge for nodes with attached documents
   - Blue search icon for nodes that used web search
   - Context percentage badge when ≥60%
2. **MergeNode** - Circular nodes combining multiple branches (amber/gold styling)
3. **SummaryNode** - Purple nodes with summarized content (280px fixed width, compact styling)

#### Document Upload & RAG
- **Node-scoped documents**: Files attach to specific conversation nodes
- **Branch isolation**: Documents only accessible to node and descendants
- **Automatic processing**: Text extraction, chunking (512 tokens default), embedding generation
- **Vector search**: Cosine similarity search for relevant chunks
- **Visual indicators**: Green 📎 badges on nodes with documents
- **Automatic cleanup**: Files and database records deleted when nodes/chats deleted
- **RAG token tracking**: Document context tokens included in context calculations
- **Supported formats**: PDF, DOCX, XLSX, PPTX, TXT, MD, PNG, JPG

### Critical Files

**Context Management:**
- `/src/services/contextService.ts` - Token estimation and context calculations
- `/src/services/modelInfoService.ts` - Model detection and context window configs
- `/src/store/conversationStore.ts` - Node management with cached `estimatedTokens`
- `/src/components/ContextIndicator.tsx` - Visual context display component
- `/src/utils/debounce.ts` - Debouncing hook for performance

**Node Components:**
- `/src/nodes/ConversationNode.tsx` - Standard message nodes with markdown rendering
- `/src/nodes/MergeNode.tsx` - Merge point nodes
- `/src/nodes/SummaryNode.tsx` - Summary nodes (280px width, left-aligned text, 200 char truncation, markdown rendering)
- `/src/components/MarkdownContent.tsx` - Reusable markdown renderer using react-markdown and remark-gfm

**Layout:**
- `/src/utils/layoutUtils.ts` - Dagre configuration (300px node width, 50px nodeSep, 60px rankSep)
- `/src/components/Canvas/CanvasView.tsx` - Memoized context map (lines 97-105)

**State Management:**
- `/src/store/conversationStore.ts` - Main state with Zustand
  - Token caching on `addNode` (line 559), `updateNodeContent` (line 843), `createSummaryNode` (line 771)
  - Recursive node deletion with `deleteNode` action
- `/src/store/settingsStore.ts` - Context config persistence

**API & Database:**
- `/server/db/index.ts` - SQLite schema with context fields, document tables
- `/server/routes/chats.ts` - Node CRUD endpoints with document cleanup
- `/server/routes/documents.ts` - Document upload, search, and management endpoints
- `/src/services/apiService.ts` - Frontend API client

**Document & RAG:**
- `/src/components/DocumentUpload/DocumentUpload.tsx` - Upload UI with drag & drop
- `/server/services/documentProcessor.ts` - Orchestrates text extraction and processing
- `/server/services/embeddingService.ts` - Embedding generation via OpenAI-compatible API
- `/server/services/vectorSearchService.ts` - Cosine similarity search with filtering
- `/server/services/chunkingService.ts` - Text chunking with token limits
- `/server/services/extractors/` - Format-specific text extractors (PDF, DOCX, XLSX, etc.)
- `/src/services/llmService.ts` - RAG integration with token tracking
- `/src/store/conversationStore.ts` - Document state management and node association

## Development Notes

### Layout Algorithm (Dagre)
The layout uses fixed dimensions for all nodes. If adding new node types:
- Update `DEFAULT_OPTIONS.nodeWidth` to accommodate widest node
- Increase `nodeSep` if nodes overlap horizontally
- Increase `rankSep` for more vertical spacing

### Performance Considerations
- Token counts are cached on nodes (`estimatedTokens?: number`)
- Context calculations are memoized per node in CanvasView
- UI updates are debounced (150ms) to smooth rapid changes
- Fallback calculation happens for legacy nodes without cached tokens

### Context Calculation Flow
1. User sends message → `addNode` calculates and caches tokens
2. RAG retrieval (if enabled) → `ragTokens` tracked and stored on node
3. CanvasView builds `nodeContextMap` (memoized, depends on nodes + config)
4. Each node gets `contextPercentage` in data (includes content + RAG tokens)
5. ChatSidebar shows debounced `ContextIndicator` when ≥60%
6. Nodes display badges when ≥60% context

### Summarization
Right-click context menu triggers:
1. `createSummaryNode` gets path to clicked node
2. LLM generates summary via `generatePathSummary`
3. Summary node created with purple styling
4. Original nodes remain (can be deleted separately)

### Testing Context Management
1. Start long conversation (20+ exchanges)
2. Watch context indicator appear in sidebar
3. Hover nodes to see context badges
4. Right-click to test summarization
5. Verify deletion (leaf nodes vs branches)

### Document Processing & RAG Flow

**Upload Flow:**
1. User selects file → `DocumentUpload` component
2. File uploaded to `/api/documents/upload/:chatId` with `nodeId`
3. Server saves file to `uploads/:chatId/` directory
4. Database record created in `documents` table (status: 'pending')
5. Association created in `document_associations` (links document to node)
6. Background processing triggered asynchronously:
   - Extract text via format-specific extractor
   - Chunk text (512 tokens default, with overlap)
   - Generate embeddings via OpenAI-compatible API
   - Store chunks in `document_chunks` table
   - Store embeddings in `document_embeddings` table
   - Update document status to 'ready' or 'failed'

**RAG Retrieval Flow:**
1. User sends message with RAG enabled
2. `llmService.sendMessageWithSearch()` checks for documents
3. `/api/documents/search` endpoint called with user query
4. Query embedded using same embedding model
5. Cosine similarity calculated against all chunk embeddings
6. Path-aware filtering: Only chunks from node's accessible documents
7. Top K chunks returned (default: 5, max 2048 tokens)
8. Chunks formatted into RAG context message
9. RAG tokens calculated and tracked: `estimateTokens(ragContext)`
10. RAG context prepended to conversation as system message
11. LLM receives full context (conversation + RAG chunks)
12. Assistant response generated with `ragTokens` field

**Document Node Association:**
- Documents attach to specific conversation nodes (usually user messages)
- `document_associations.node_id` tracks the association
- Path calculation: `getPathToNode()` builds ancestor chain
- RAG search filters by: `WHERE node_id IN (ancestor_node_ids)`
- Branch isolation: Alternative branches don't see each other's documents

**Document Cleanup:**
- Node deletion: Query associated docs → delete files → delete DB records
- Chat deletion: Query all docs in chat → delete files → delete DB records
- CASCADE constraints handle chunks and embeddings automatically

## Common Issues

**Summary nodes overlapping:**
- Check `SummaryNode.tsx` width is 280px fixed
- Verify `layoutUtils.ts` has nodeWidth ≥300px and nodeSep ≥50px

**Context not updating:**
- Ensure nodes have `estimatedTokens` cached
- Check memoization dependencies in CanvasView and ChatSidebar
- Verify contextConfig is loaded from settings

**Performance issues:**
- Profile with React DevTools
- Check if token caching is working (`node.estimatedTokens` should exist)
- Verify memoization isn't being bypassed by changing dependencies

**Document upload stuck in "processing":**
- Check server logs for extraction errors
- Verify embedding API is configured and accessible
- Check `documents` table status column for error messages
- Ensure file format is supported by appropriate extractor

**RAG not finding relevant chunks:**
- Verify chunks were created (`document_chunks` table)
- Check embeddings exist (`document_embeddings` table)
- Ensure query uses same embedding model as indexing
- Try adjusting `minScore` threshold (default: 0.5)
- Increase `topK` to retrieve more chunks

**Documents not showing in branch:**
- Check document's `node_id` in `document_associations`
- Verify current node is descendant of document node
- Use path calculation: `getPathToNode(currentNodeId)`
- Confirm document status is 'ready' not 'failed'

**Context percentage higher than expected:**
- RAG tokens are now included in context calculations
- Check `node.ragTokens` field for RAG overhead
- Adjust `maxTokens` in RAG config to limit chunk size
- Reduce `topK` to retrieve fewer chunks

**Document cleanup not working:**
- Verify CASCADE constraints in database schema
- Check server has write permissions to `uploads/` directory
- Look for errors in `DELETE /api/nodes/:id` endpoint logs
- Ensure `fs` module is imported in `chats.ts`
