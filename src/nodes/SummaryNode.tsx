import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useConversationStore } from '../store/conversationStore';

export interface SummaryNodeData extends Record<string, unknown> {
  content: string;  // The summary text
  isActive: boolean;
  isOnActivePath: boolean;
  isSelected: boolean;
  summarizedCount: number;  // How many original nodes this summarizes
  hasChildren: boolean;  // Whether it has children (affects editability)
  contextPercentage?: number;  // Context usage percentage for this path
}

export type SummaryNodeType = Node<SummaryNodeData, 'summary'>;

function SummaryNodeComponent({ data, selected, id }: NodeProps<SummaryNodeType>): JSX.Element {
  const { content, isActive, isOnActivePath, isSelected, summarizedCount, hasChildren, contextPercentage } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const { updateNodeContent } = useConversationStore();

  // Show context indicator when above 60% threshold
  const showContextIndicator = contextPercentage !== undefined && contextPercentage >= 0.6;
  const contextState = contextPercentage !== undefined && contextPercentage >= 0.95 ? 'critical' : contextPercentage !== undefined && contextPercentage >= 0.8 ? 'warning' : 'normal';

  // Truncate long content for display - keep summaries concise
  const displayContent = content.length > 200
    ? content.substring(0, 200) + '...'
    : content;

  // Handle double-click to edit (only if no children)
  const handleDoubleClick = useCallback(() => {
    if (!hasChildren) {
      setIsEditing(true);
      setEditedContent(content);
    }
  }, [hasChildren, content]);

  // Save edited content
  const handleSave = useCallback(async () => {
    if (editedContent.trim() && editedContent !== content) {
      await updateNodeContent(id, editedContent.trim());
    }
    setIsEditing(false);
  }, [editedContent, content, id, updateNodeContent]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedContent(content);
  }, [content]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  return (
    <>
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-purple-400 !w-2 !h-2"
      />

      {/* Summary node - compact size to prevent overlaps */}
      <div
        className={`
          relative px-4 py-3 w-[280px] text-xs leading-snug
          transition-all duration-150 cursor-pointer
          bg-purple-500/10 border-2 border-purple-400/60
          rounded-xl
          ${isSelected
            ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-[var(--color-background)]'
            : isActive
            ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-[var(--color-background)]'
            : ''
          }
          ${isSelected || isOnActivePath || isActive
            ? 'opacity-100'
            : 'opacity-50'
          }
          ${selected
            ? 'shadow-lg shadow-purple-500/30 scale-105'
            : 'shadow-sm hover:shadow-md'
          }
        `}
        onDoubleClick={handleDoubleClick}
      >
        {/* Summary label with icon */}
        <div className="text-xs font-medium mb-1 text-purple-400 flex items-center gap-1.5 justify-center">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Summary</span>
        </div>

        {/* Content preview or editor */}
        {isEditing ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface)] border border-purple-400 rounded text-[var(--color-text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
              rows={3}
              autoFocus
              placeholder="Edit summary..."
            />
            <div className="flex gap-1 justify-center">
              <button
                onClick={handleSave}
                className="px-2 py-1 text-[10px] bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
              >
                Save (⌘↵)
              </button>
              <button
                onClick={handleCancel}
                className="px-2 py-1 text-[10px] bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Cancel (Esc)
              </button>
            </div>
          </div>
        ) : (
          <div className="text-left text-xs leading-snug text-[var(--color-text-primary)] break-words">
            {displayContent}
          </div>
        )}

        {/* Summarized count badge */}
        {summarizedCount > 0 && (
          <div
            className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 bg-purple-500 text-white text-[9px] font-bold rounded-full shadow-sm"
            title={`Summarizes ${summarizedCount} messages`}
          >
            {summarizedCount}
          </div>
        )}

        {/* Context indicator badge */}
        {showContextIndicator && (
          <div
            className={`
              absolute -top-1.5 -right-1.5
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

      {/* Edit hint when double-clicked and has no children */}
      {selected && !hasChildren && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 bg-[var(--color-surface)] text-[var(--color-text-secondary)] text-[10px] rounded border border-[var(--color-border)] shadow-sm">
          Double-click to edit summary
        </div>
      )}

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-400 !w-2 !h-2"
      />
    </>
  );
}

export const SummaryNode = memo(SummaryNodeComponent);
