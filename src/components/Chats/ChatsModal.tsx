import { useEffect } from 'react';
import { useConversationStore } from '../../store/conversationStore';

interface ChatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewChat: () => void;
}

export function ChatsModal({ isOpen, onClose, onOpenNewChat }: ChatsModalProps): JSX.Element | null {
  const {
    chats,
    activeChatId,
    switchChat,
    deleteChat,
  } = useConversationStore();

  // Handle key press for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-open New Chat Dialog when modal opens with no chats
  useEffect(() => {
    if (isOpen && chats.length === 0) {
      onOpenNewChat();
    }
  }, [isOpen, chats.length, onOpenNewChat]);

  if (!isOpen) return null;

  const handleSwitchChat = async (chatId: string) => {
    try {
      await switchChat(chatId);
      onClose();
    } catch (error) {
      console.error('Failed to switch chat:', error);
    }
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    deleteChat(chatId);

    // If this was the last chat, close modal and show New Chat Dialog
    if (chats.length === 1) {
      onOpenNewChat();
    }
  };

  // Sort chats by creation date (newest first)
  const sortedChats = [...chats].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)] max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chats-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2
            id="chats-title"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            Saved Chats
          </h2>
          <button
            type="button"
            onClick={onOpenNewChat}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 transition-opacity"
          >
            + New Chat
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-4">
          {sortedChats.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">
              No saved chats yet
            </p>
          ) : (
            <ul className="space-y-2">
              {sortedChats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => handleSwitchChat(chat.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                      chat.id === activeChatId
                        ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30'
                        : 'bg-[var(--color-background)] hover:bg-[var(--color-background)]/80 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium truncate ${
                        chat.id === activeChatId
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-text-primary)]'
                      }`}>
                        {chat.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {chat.nodes.length} messages • {formatDate(chat.createdAt)}
                      </p>
                    </div>
                    <button
                        type="button"
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-error)] rounded transition-colors flex-shrink-0"
                        aria-label="Delete chat"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] bg-transparent border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-background)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Format date helper
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}
