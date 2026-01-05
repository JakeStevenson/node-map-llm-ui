import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  useOnSelectionChange,
  type Node,
  type Edge,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { nodeTypes } from '../../nodes';
import type { ConversationNodeType, ConversationNodeData } from '../../nodes/ConversationNode';
import type { MergeNodeType, MergeNodeData } from '../../nodes/MergeNode';
import type { SummaryNodeType, SummaryNodeData } from '../../nodes/SummaryNode';
import { useConversationStore } from '../../store/conversationStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getLayoutedElements } from '../../utils/layoutUtils';
import { calculatePathContext } from '../../services/contextService';
import { generatePathSummary } from '../../services/llmService';

function CanvasViewInner(): JSX.Element {
  const { setCenter, getZoom } = useReactFlow();
  const prevNodeCountRef = useRef<number>(0);
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    nodeId: string;
    hasChildren: boolean;
    childCount: number;
  } | null>(null);

  const {
    nodes: conversationNodes,
    activeNodeId,
    selectedNodeIds,
    selectNode,
    toggleNodeSelection,
    clearNodeSelection,
    navigateToNode,
    getPathToNode,
    createSummaryNode,
    deleteNode,
  } = useConversationStore();

  const { getContextConfig, getConfig } = useSettingsStore();
  const contextConfig = getContextConfig();

  // Sync React Flow's selection with our store (for Ctrl+click / box select)
  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      // When React Flow's selection changes, update our store
      // This handles Ctrl+click, Cmd+click, and box selection
      if (selectedNodes.length >= 2) {
        // Multiple nodes selected via React Flow - sync to our store
        const newSelectedIds = selectedNodes.map((n) => n.id);
        // Only update if different from current selection
        if (newSelectedIds.length !== selectedNodeIds.length ||
            !newSelectedIds.every((id) => selectedNodeIds.includes(id))) {
          // Clear and set new selection
          clearNodeSelection();
          newSelectedIds.forEach((id) => toggleNodeSelection(id));
        }
      }
    },
  });

  // ESC key clears multi-select
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedNodeIds.length > 0) {
        clearNodeSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds.length, clearNodeSelection]);

  // Build active path for highlighting
  const activePathIds = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const path = getPathToNode(activeNodeId);
    return new Set(path.map((n) => n.id));
  }, [activeNodeId, getPathToNode]);

  // Memoized context calculation - only recalculates when nodes or config change
  // This is separate from node rendering to avoid recalculating on selection changes
  const nodeContextMap = useMemo(() => {
    const contextMap = new Map<string, number>();
    conversationNodes.forEach((node) => {
      const pathToNode = getPathToNode(node.id);
      const contextStatus = calculatePathContext(pathToNode, contextConfig);
      contextMap.set(node.id, contextStatus.percentage);
    });
    return contextMap;
  }, [conversationNodes, contextConfig, getPathToNode]);

  // Convert conversation nodes to React Flow nodes
  const { nodes, edges } = useMemo(() => {
    if (conversationNodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Sort nodes by creation time for stable Dagre layout
    const sortedNodes = [...conversationNodes].sort((a, b) => a.createdAt - b.createdAt);

    // Calculate child count for each node (count edges from all parents)
    const childCounts = new Map<string, number>();
    sortedNodes.forEach((node) => {
      for (const parentId of node.parentIds) {
        childCounts.set(parentId, (childCounts.get(parentId) || 0) + 1);
      }
    });

    // Create React Flow nodes (summary > merge > conversation priority)
    const flowNodes: (ConversationNodeType | MergeNodeType | SummaryNodeType)[] = sortedNodes.map((node) => {
      const isSummaryNode = node.isSummary === true;
      const isMergeNode = !isSummaryNode && node.parentIds.length >= 2;
      const contextPercentage = nodeContextMap.get(node.id) || 0;

      // Summary nodes
      if (isSummaryNode) {
        const summarizedCount = node.summarizedNodeIds?.length || 0;
        const hasChildren = (childCounts.get(node.id) || 0) > 0;

        return {
          id: node.id,
          type: 'summary' as const,
          position: { x: 0, y: 0 }, // Will be set by Dagre
          data: {
            content: node.content,
            isActive: node.id === activeNodeId,
            isOnActivePath: activePathIds.has(node.id),
            isSelected: selectedNodeIds.includes(node.id),
            summarizedCount,
            hasChildren,
            contextPercentage,
          } as SummaryNodeData,
        };
      }

      // Merge nodes
      if (isMergeNode) {
        return {
          id: node.id,
          type: 'merge' as const,
          position: { x: 0, y: 0 }, // Will be set by Dagre
          data: {
            isActive: node.id === activeNodeId,
            isOnActivePath: activePathIds.has(node.id),
            isSelected: selectedNodeIds.includes(node.id),
            parentCount: node.parentIds.length,
            contextPercentage,
          } as MergeNodeData,
        };
      }

      // Conversation nodes
      return {
        id: node.id,
        type: 'conversation' as const,
        position: { x: 0, y: 0 }, // Will be set by Dagre
        data: {
          role: node.role,
          content: node.content,
          isActive: node.id === activeNodeId,
          isOnActivePath: activePathIds.has(node.id),
          isSelected: selectedNodeIds.includes(node.id),
          childCount: childCounts.get(node.id) || 0,
          hasSearchMetadata: !!node.searchMetadata,
          contextPercentage,
        } as ConversationNodeData,
      };
    });

    // Create edges from parent relationships (DAG support: one edge per parent)
    const flowEdges: Edge[] = sortedNodes.flatMap((node) => {
      const isSummaryNode = node.isSummary === true;
      const isMergeNode = !isSummaryNode && node.parentIds.length >= 2;

      return node.parentIds.map((parentId) => ({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        className: isSummaryNode
          ? activePathIds.has(node.id) && activePathIds.has(parentId)
            ? 'stroke-purple-500'
            : 'stroke-purple-400 opacity-50'
          : isMergeNode
            ? activePathIds.has(node.id) && activePathIds.has(parentId)
              ? 'stroke-amber-500'
              : 'stroke-amber-400 opacity-50'
            : activePathIds.has(node.id) && activePathIds.has(parentId)
              ? 'stroke-[var(--color-accent)]'
              : 'stroke-[var(--color-border)] opacity-50',
      }));
    });

    // Apply Dagre layout
    return getLayoutedElements(flowNodes, flowEdges);
  }, [conversationNodes, activeNodeId, activePathIds, selectedNodeIds, nodeContextMap]);

  // Auto-pan only when NEW nodes are added (not when navigating to existing nodes)
  // Preserves current zoom level
  useEffect(() => {
    const currentCount = conversationNodes.length;
    const isNewNode = currentCount > prevNodeCountRef.current;
    prevNodeCountRef.current = currentCount;

    if (isNewNode && activeNodeId) {
      // Small delay to let layout settle, then pan to node without changing zoom
      setTimeout(() => {
        const node = nodes.find((n) => n.id === activeNodeId);
        if (node) {
          const currentZoom = getZoom();
          // Center on node (account for node size ~180x80)
          setCenter(node.position.x + 90, node.position.y + 40, {
            zoom: currentZoom,
            duration: 300,
          });
        }
      }, 100);
    }
  }, [conversationNodes.length, activeNodeId, nodes, setCenter, getZoom]);

  // Handle node click - select and navigate (shift-click for multi-select)
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.shiftKey) {
        // Shift-click: toggle multi-selection (don't navigate)
        toggleNodeSelection(node.id);
      } else {
        // Regular click: single select + navigate (no viewport change)
        selectNode(node.id);
        navigateToNode(node.id);
      }
    },
    [selectNode, toggleNodeSelection, navigateToNode]
  );

  // Handle background click - deselect and close menu
  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
    setDeleteConfirm(null);
  }, [selectNode]);

  // Handle right-click on node
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();

    // Always close any existing menu/dialog first
    setDeleteConfirm(null);

    // Show context menu (will conditionally show options based on node type)
    setContextMenu({
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, [conversationNodes]);

  // Handle summarize action
  const handleSummarize = useCallback(async () => {
    if (!contextMenu || isSummarizing) return;

    const nodeId = contextMenu.nodeId;
    setContextMenu(null);
    setIsSummarizing(true);
    setErrorMessage(null);

    try {
      // Get the path to summarize
      const path = conversationNodes.filter((n) => {
        // Build path by following parents from nodeId to root
        const pathToNode = getPathToNode(nodeId);
        return pathToNode.some((p) => p.id === n.id);
      });

      // Build messages for LLM
      const messages = path
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((n) => ({
          id: n.id,
          role: n.role,
          content: n.content,
          createdAt: n.createdAt,
        }));

      // Generate summary via LLM
      const llmConfig = getConfig();
      const summary = await generatePathSummary(llmConfig, messages);

      // Check if we got a placeholder fallback (indicates LLM failed)
      if (summary.startsWith('Summary of ') && summary.includes('messages (')) {
        setErrorMessage('Failed to generate AI summary. Check your LLM settings and try again. A placeholder summary was created instead.');
      }

      // Create summary node with generated content
      await createSummaryNode(nodeId, summary);
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setErrorMessage(`Summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}. Check your LLM configuration.`);
      // Fall back to placeholder summary
      await createSummaryNode(nodeId);
    } finally {
      setIsSummarizing(false);
    }
  }, [contextMenu, isSummarizing, conversationNodes, getPathToNode, getConfig, createSummaryNode]);

  // Handle delete action
  const handleDelete = useCallback((nodeId: string) => {
    try {
      // Count children
      const childCount = conversationNodes.filter((n) => n.parentIds.includes(nodeId)).length;
      const hasChildren = childCount > 0;

      if (hasChildren) {
        // Show confirmation dialog
        setDeleteConfirm({ nodeId, hasChildren, childCount });
      } else {
        // Delete immediately
        deleteNode(nodeId);
      }
    } catch (error) {
      console.error('Error during delete:', error);
      setErrorMessage('Failed to delete node. Please try again.');
    } finally {
      setContextMenu(null);
    }
  }, [conversationNodes, deleteNode]);

  // Confirm and execute deletion
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      await deleteNode(deleteConfirm.nodeId);
    } catch (error) {
      console.error('Error deleting node:', error);
      setErrorMessage('Failed to delete node. Please try again.');
    } finally {
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, deleteNode]);

  // Close context menu and dialogs on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setDeleteConfirm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-dismiss error message after 8 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        className="bg-[var(--color-background)]"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-border)" gap={16} />
        <Controls
          showZoom={true}
          showFitView={false}
          showInteractive={false}
        />
      </ReactFlow>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[var(--color-text-secondary)] text-sm">
            Start a conversation to see the tree...
          </p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (() => {
        const node = conversationNodes.find((n) => n.id === contextMenu.nodeId);
        const isSummary = node?.isSummary === true;

        return (
          <div
            className="fixed z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
          >
            {!isSummary && (
              <button
                onClick={handleSummarize}
                disabled={isSummarizing}
                className="w-full px-4 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Summarize up to here
              </button>
            )}
            <button
              onClick={() => handleDelete(contextMenu.nodeId)}
              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-[var(--color-hover)] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete node
            </button>
          </div>
        );
      })()}

      {/* Summarizing indicator */}
      {isSummarizing && (
        <div className="fixed bottom-4 right-4 z-50 bg-purple-500/90 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Generating summary...
        </div>
      )}

      {/* Error notification */}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-500/95 text-white px-4 py-3 rounded-lg shadow-lg max-w-md">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <div className="font-medium text-sm mb-1">Summarization Error</div>
              <div className="text-xs opacity-90">{errorMessage}</div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-6 max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">Delete Branch?</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  This node has <span className="font-medium text-[var(--color-text-primary)]">{deleteConfirm.childCount} {deleteConfirm.childCount === 1 ? 'child' : 'children'}</span>. Deleting it will remove the entire branch and cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasView(): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasViewInner />
    </ReactFlowProvider>
  );
}

