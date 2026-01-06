import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { SearchIcon } from '../components/icons';
import { MarkdownContent } from '../components/MarkdownContent';

export interface ConversationNodeData extends Record<string, unknown> {
  role: 'user' | 'assistant';
  content: string;
  isActive: boolean;
  isOnActivePath: boolean;
  isSelected: boolean;  // Multi-select for merge feature
  childCount: number;
  hasSearchMetadata: boolean;  // Whether web search was used for this response
  hasDocuments: boolean;  // Whether documents are attached to this node
  contextPercentage?: number;  // Context usage percentage for this path
  onEdit?: (newContent: string, shouldBranch: boolean) => void;  // Callback for editing
  isVariation?: boolean;  // Whether this is a variation branch
}

export type ConversationNodeType = Node<ConversationNodeData, 'conversation'>;

function ConversationNodeComponent({ data, selected }: NodeProps<ConversationNodeType>): JSX.Element {
  const { role, content, isActive, isOnActivePath, isSelected, childCount, hasSearchMetadata, hasDocuments, contextPercentage, onEdit } = data;
  const isUser = role === 'user';
  const hasChildren = childCount > 0;

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  // Show context indicator when above 60% threshold
  const showContextIndicator = contextPercentage !== undefined && contextPercentage >= 0.6;
  const contextState = contextPercentage !== undefined && contextPercentage >= 0.95 ? 'critical' : contextPercentage !== undefined && contextPercentage >= 0.8 ? 'warning' : 'normal';

  // Truncate long content for display (keep short to prevent layout issues)
  const displayContent = content.length > 60
    ? content.substring(0, 60) + '...'
    : content;

  // Edit handlers
  const handleDoubleClick = () => {
    if (isUser && onEdit) {
      setIsEditing(true);
      setEditedContent(content);
    }
  };

  const handleSave = () => {
    if (editedContent.trim() && onEdit) {
      const shouldBranch = hasChildren;
      onEdit(editedContent.trim(), shouldBranch);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

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
          relative px-3 py-2 rounded-lg ${isEditing ? 'w-[280px]' : 'w-[180px]'} text-sm
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
        onDoubleClick={handleDoubleClick}
      >
        {/* Role indicator */}
        <div className={`text-xs font-medium mb-1 ${isUser ? 'text-white/70' : 'text-[var(--color-text-secondary)]'}`}>
          {isUser ? 'You' : 'Assistant'}
        </div>

        {isEditing ? (
          /* Edit mode */
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-24 px-2 py-1 text-xs bg-white/10 border border-white/20 rounded resize-none focus:outline-none focus:ring-1 focus:ring-white/40"
              autoFocus
              placeholder="Edit your message..."
            />
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={handleCancel}
                className="px-2 py-1 text-[10px] bg-white/10 hover:bg-white/20 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-2 py-1 text-[10px] bg-white/90 text-[var(--color-accent)] hover:bg-white rounded transition-colors font-medium"
              >
                {hasChildren ? 'Branch & Regenerate' : 'Update'}
              </button>
            </div>
          </div>
        ) : (
          /* Normal display */
          <div className="break-words leading-snug line-clamp-3">
            <MarkdownContent content={displayContent} />
          </div>
        )}

        {/* Document indicator badge */}
        {hasDocuments && (
          <div
            className="absolute -top-1.5 -left-1.5 p-1 bg-green-500 rounded-full shadow-sm"
            title="Documents attached"
          >
            <span className="text-white text-[10px]">📎</span>
          </div>
        )}

        {/* Search indicator badge */}
        {hasSearchMetadata && (
          <div
            className="absolute -top-1.5 -right-1.5 p-1 bg-blue-500 rounded-full shadow-sm"
            title="Web search was used"
          >
            <SearchIcon size={10} strokeWidth={2.5} className="text-white" />
          </div>
        )}

        {/* Context indicator badge */}
        {showContextIndicator && (
          <div
            className={`
              absolute -top-1.5 ${hasSearchMetadata ? '-right-8' : '-right-1.5'}
              px-1.5 py-0.5 rounded-full shadow-sm text-[9px] font-bold
              ${contextState === 'critical'
                ? 'bg-red-500 text-white'
                : contextState === 'warning'
                ? 'bg-yellow-500 text-white'
                : 'bg-blue-400 text-white'
              }
            `}
            title={`Context usage: ${Math.round(contextPercentage! * 100)}%`}
          >
            {Math.round(contextPercentage! * 100)}%
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
