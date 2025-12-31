import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

export interface ConversationNodeData extends Record<string, unknown> {
  role: 'user' | 'assistant';
  content: string;
  isActive: boolean;
  isOnActivePath: boolean;
}

export type ConversationNodeType = Node<ConversationNodeData, 'conversation'>;

function ConversationNodeComponent({ data, selected }: NodeProps<ConversationNodeType>): JSX.Element {
  const { role, content, isActive, isOnActivePath } = data;
  const isUser = role === 'user';

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
          px-3 py-2 rounded-lg min-w-[120px] max-w-[200px] text-sm
          transition-all duration-150 cursor-pointer
          ${isUser
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
          }
          ${isActive
            ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-background)]'
            : ''
          }
          ${isOnActivePath && !isActive
            ? 'opacity-100'
            : !isOnActivePath
            ? 'opacity-50'
            : ''
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
        <div className="whitespace-pre-wrap break-words leading-snug line-clamp-3">
          {displayContent}
        </div>
      </div>

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
