import { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { nodeTypes } from '../../nodes';
import type { ConversationNodeType, ConversationNodeData } from '../../nodes/ConversationNode';
import { useConversationStore } from '../../store/conversationStore';
import { getLayoutedElements } from '../../utils/layoutUtils';

function CanvasViewInner(): JSX.Element {
  const { fitView } = useReactFlow();
  const prevActiveNodeIdRef = useRef<string | null>(null);

  const {
    nodes: conversationNodes,
    activeNodeId,
    selectNode,
    navigateToNode,
    getPathToNode,
  } = useConversationStore();

  // Auto-pan to new active node when it changes (e.g., new message added)
  useEffect(() => {
    if (activeNodeId && activeNodeId !== prevActiveNodeIdRef.current) {
      prevActiveNodeIdRef.current = activeNodeId;

      // Small delay to let layout settle
      setTimeout(() => {
        fitView({
          nodes: [{ id: activeNodeId }],
          duration: 300,
          padding: 0.5,
        });
      }, 100);
    }
  }, [activeNodeId, fitView]);

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

    // Create React Flow nodes
    const flowNodes: ConversationNodeType[] = conversationNodes.map((node) => ({
      id: node.id,
      type: 'conversation' as const,
      position: { x: 0, y: 0 }, // Will be set by Dagre
      data: {
        role: node.role,
        content: node.content,
        isActive: node.id === activeNodeId,
        isOnActivePath: activePathIds.has(node.id),
      } as ConversationNodeData,
    }));

    // Create edges from parent relationships
    const flowEdges: Edge[] = conversationNodes
      .filter((node) => node.parentId !== null)
      .map((node) => ({
        id: `e-${node.parentId}-${node.id}`,
        source: node.parentId!,
        target: node.id,
        className: activePathIds.has(node.id) && activePathIds.has(node.parentId!)
          ? 'stroke-[var(--color-accent)]'
          : 'stroke-[var(--color-border)] opacity-50',
      }));

    // Apply Dagre layout
    return getLayoutedElements(flowNodes, flowEdges);
  }, [conversationNodes, activeNodeId, activePathIds]);

  // Handle node click - select and navigate
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      navigateToNode(node.id);

      // Fit view to center on selected node
      setTimeout(() => {
        fitView({
          nodes: [{ id: node.id }],
          duration: 300,
          padding: 0.5,
        });
      }, 50);
    },
    [selectNode, navigateToNode, fitView]
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
          className="!bg-[var(--color-surface)] !border-[var(--color-border)] !shadow-md"
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

