import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

interface LayoutOptions {
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB', // Top to bottom (vertical tree)
  nodeWidth: 200,
  nodeHeight: 100, // Increased for multi-line content
  rankSep: 50, // Vertical spacing between ranks
  nodeSep: 40, // Horizontal spacing between nodes
};

/**
 * Apply Dagre layout to nodes and edges.
 * Returns new nodes with calculated positions.
 * NEVER manually set positions - always use this function.
 */
export function getLayoutedElements<T extends Node>(
  nodes: T[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: T[]; edges: Edge[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: opts.direction,
    ranksep: opts.rankSep,
    nodesep: opts.nodeSep,
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(dagreGraph);

  // Apply positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        // Dagre returns center position, adjust to top-left
        x: nodeWithPosition.x - opts.nodeWidth / 2,
        y: nodeWithPosition.y - opts.nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Get the path from root to a specific node.
 */
export function getPathToNode(
  nodeId: string,
  nodes: Array<{ id: string; parentId: string | null }>
): string[] {
  const path: string[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    path.unshift(currentId);
    const node = nodes.find((n) => n.id === currentId);
    currentId = node?.parentId ?? null;
  }

  return path;
}

/**
 * Get all ancestor IDs for a node.
 */
export function getAncestorIds(
  nodeId: string,
  nodes: Array<{ id: string; parentId: string | null }>
): Set<string> {
  const ancestors = new Set<string>();
  let currentId: string | null = nodeId;

  while (currentId) {
    const node = nodes.find((n) => n.id === currentId);
    if (node?.parentId) {
      ancestors.add(node.parentId);
      currentId = node.parentId;
    } else {
      break;
    }
  }

  return ancestors;
}
