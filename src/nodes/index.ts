import type { NodeTypes } from '@xyflow/react';
import { ConversationNode } from './ConversationNode';
import { MergeNode } from './MergeNode';
import { SummaryNode } from './SummaryNode';

export const nodeTypes = {
  conversation: ConversationNode,
  merge: MergeNode,
  summary: SummaryNode,
} satisfies NodeTypes;

export { ConversationNode } from './ConversationNode';
export { MergeNode } from './MergeNode';
export { SummaryNode } from './SummaryNode';
export type { ConversationNodeData, ConversationNodeType } from './ConversationNode';
export type { MergeNodeData, MergeNodeType } from './MergeNode';
export type { SummaryNodeData, SummaryNodeType } from './SummaryNode';
