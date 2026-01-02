import { useCallback, useMemo, useEffect, useRef } from 'react';
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
import { useConversationStore } from '../../store/conversationStore';
import { getLayoutedElements } from '../../utils/layoutUtils';

function CanvasViewInner(): JSX.Element {
  const { setCenter, getZoom } = useReactFlow();
  const prevNodeCountRef = useRef<number>(0);

  const {
    nodes: conversationNodes,
    activeNodeId,
    selectedNodeIds,
    selectNode,
    toggleNodeSelection,
    clearNodeSelection,
    navigateToNode,
    getPathToNode,
  } = useConversationStore();

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

    // Create React Flow nodes (use merge type for nodes with multiple parents)
    const flowNodes: (ConversationNodeType | MergeNodeType)[] = sortedNodes.map((node) => {
      const isMergeNode = node.parentIds.length >= 2;

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
          } as MergeNodeData,
        };
      }

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
        } as ConversationNodeData,
      };
    });

    // Create edges from parent relationships (DAG support: one edge per parent)
    const flowEdges: Edge[] = sortedNodes.flatMap((node) => {
      const isMergeNode = node.parentIds.length >= 2;

      return node.parentIds.map((parentId) => ({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        className: isMergeNode
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
  }, [conversationNodes, activeNodeId, activePathIds, selectedNodeIds]);

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

  // Handle background click - deselect
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
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

