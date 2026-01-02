import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { SearchIcon } from '../components/icons';

export interface ConversationNodeData extends Record<string, unknown> {
  role: 'user' | 'assistant';
  content: string;
  isActive: boolean;
  isOnActivePath: boolean;
  isSelected: boolean;  // Multi-select for merge feature
  childCount: number;
  hasSearchMetadata: boolean;  // Whether web search was used for this response
}

export type ConversationNodeType = Node<ConversationNodeData, 'conversation'>;

function ConversationNodeComponent({ data, selected }: NodeProps<ConversationNodeType>): JSX.Element {
  const { role, content, isActive, isOnActivePath, isSelected, childCount, hasSearchMetadata } = data;
  const isUser = role === 'user';
  const hasChildren = childCount > 0;

  // Truncate long content for display (keep short to prevent layout issues)
  const displayContent = content.length > 60
    ? content.substring(0, 60) + '...'
    : content;

  return (
    <>
      {/* Input handle (top) - not shown on root node */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[var(--color-border)] !w-2 !h-2"
      />

      <div
        className={`
          relative px-3 py-2 rounded-lg w-[180px] text-sm
          transition-all duration-150 cursor-pointer
          ${isUser
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
          }
          ${isSelected
            ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[var(--color-background)]'
            : isActive
            ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-background)]'
            : ''
          }
          ${isSelected || isOnActivePath || isActive
            ? 'opacity-100'
            : 'opacity-50'
          }
          ${selected
            ? 'shadow-lg scale-105'
            : 'shadow-sm hover:shadow-md'
          }
        `}
      >
        {/* Role indicator */}
        <div className={`text-xs font-medium mb-1 ${isUser ? 'text-white/70' : 'text-[var(--color-text-secondary)]'}`}>
          {isUser ? 'You' : 'Assistant'}
        </div>

        {/* Content preview */}
        <div className="break-words leading-snug line-clamp-3">
          {displayContent}
        </div>

        {/* Search indicator badge */}
        {hasSearchMetadata && (
          <div
            className="absolute -top-1.5 -right-1.5 p-1 bg-blue-500 rounded-full shadow-sm"
            title="Web search was used"
          >
            <SearchIcon size={10} strokeWidth={2.5} className="text-white" />
          </div>
        )}
      </div>


      {/* Branch hint when selected on a node with children */}
      {selected && hasChildren && !isActive && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 bg-[var(--color-surface)] text-[var(--color-text-secondary)] text-[10px] rounded border border-[var(--color-border)] shadow-sm">
          Type to branch from here
        </div>
      )}

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[var(--color-border)] !w-2 !h-2"
      />
    </>
  );
}

export const ConversationNode = memo(ConversationNodeComponent);
