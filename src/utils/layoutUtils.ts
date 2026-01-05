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
  nodeWidth: 300, // Accommodate summary nodes (280px) + margin
  nodeHeight: 120, // Increased for multi-line content
  rankSep: 60, // Vertical spacing between ranks
  nodeSep: 50, // Horizontal spacing between nodes (increased for wider nodes)
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
 * For merge nodes (multiple parents), follows first parent only.
 */
export function getPathToNode(
  nodeId: string,
  nodes: Array<{ id: string; parentIds: string[] }>
): string[] {
  const path: string[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    path.unshift(currentId);
    const node = nodes.find((n) => n.id === currentId);
    currentId = node?.parentIds[0] ?? null;
  }

  return path;
}

/**
 * Get all ancestor IDs for a node.
 * For merge nodes, collects ancestors from ALL parent paths.
 */
export function getAncestorIds(
  nodeId: string,
  nodes: Array<{ id: string; parentIds: string[] }>
): Set<string> {
  const ancestors = new Set<string>();
  const toVisit: string[] = [nodeId];
  const visited = new Set<string>();

  while (toVisit.length > 0) {
    const currentId = toVisit.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = nodes.find((n) => n.id === currentId);
    if (node) {
      for (const parentId of node.parentIds) {
        ancestors.add(parentId);
        toVisit.push(parentId);
      }
    }
  }

  return ancestors;
}
