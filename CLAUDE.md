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

#### Node Types
1. **ConversationNode** - Regular user/assistant messages (~220px width)
2. **MergeNode** - Circular nodes combining multiple branches (amber/gold styling)
3. **SummaryNode** - Purple nodes with summarized content (280px fixed width, compact styling)

### Critical Files

**Context Management:**
- `/src/services/contextService.ts` - Token estimation and context calculations
- `/src/services/modelInfoService.ts` - Model detection and context window configs
- `/src/store/conversationStore.ts` - Node management with cached `estimatedTokens`
- `/src/components/ContextIndicator.tsx` - Visual context display component
- `/src/utils/debounce.ts` - Debouncing hook for performance

**Node Components:**
- `/src/nodes/ConversationNode.tsx` - Standard message nodes
- `/src/nodes/MergeNode.tsx` - Merge point nodes
- `/src/nodes/SummaryNode.tsx` - Summary nodes (280px width, left-aligned text, 200 char truncation)

**Layout:**
- `/src/utils/layoutUtils.ts` - Dagre configuration (300px node width, 50px nodeSep, 60px rankSep)
- `/src/components/Canvas/CanvasView.tsx` - Memoized context map (lines 97-105)

**State Management:**
- `/src/store/conversationStore.ts` - Main state with Zustand
  - Token caching on `addNode` (line 559), `updateNodeContent` (line 843), `createSummaryNode` (line 771)
  - Recursive node deletion with `deleteNode` action
- `/src/store/settingsStore.ts` - Context config persistence

**API & Database:**
- `/server/db/index.ts` - SQLite schema with context fields
- `/server/routes/chats.ts` - Node CRUD endpoints including deletion
- `/src/services/apiService.ts` - Frontend API client

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
2. CanvasView builds `nodeContextMap` (memoized, depends on nodes + config)
3. Each node gets `contextPercentage` in data
4. ChatSidebar shows debounced `ContextIndicator` when ≥60%
5. Nodes display badges when ≥60% context

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
