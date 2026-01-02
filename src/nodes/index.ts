import type { NodeTypes } from '@xyflow/react';
import { ConversationNode } from './ConversationNode';
import { MergeNode } from './MergeNode';

export const nodeTypes = {
  conversation: ConversationNode,
  merge: MergeNode,
} satisfies NodeTypes;

export { ConversationNode } from './ConversationNode';
export { MergeNode } from './MergeNode';
export type { ConversationNodeData, ConversationNodeType } from './ConversationNode';
export type { MergeNodeData, MergeNodeType } from './MergeNode';
