import type { NodeTypes } from '@xyflow/react';
import { ConversationNode } from './ConversationNode';

export const nodeTypes = {
  conversation: ConversationNode,
} satisfies NodeTypes;

export { ConversationNode } from './ConversationNode';
export type { ConversationNodeData, ConversationNodeType } from './ConversationNode';
