import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type Node,
  type Edge,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

// Temporary demo nodes - will be replaced with conversation nodes
const initialNodes: Node[] = [
  {
    id: '1',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: 'Start your conversation...' },
  },
];

const initialEdges: Edge[] = [];

export function CanvasView(): JSX.Element {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((edges) => addEdge(connection, edges)),
    [setEdges]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        edges={edges}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        className="bg-[var(--color-background)]"
      >
        <Background color="var(--color-border)" gap={16} />
        <Controls
          className="!bg-[var(--color-surface)] !border-[var(--color-border)] !shadow-md"
        />
      </ReactFlow>
    </div>
  );
}

