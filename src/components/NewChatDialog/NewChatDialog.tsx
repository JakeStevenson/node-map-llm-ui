import { useState, useEffect } from 'react';
import { useConversationStore } from '../../store/conversationStore';
import { useSettingsStore } from '../../store/settingsStore';

interface NewChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewChatDialog({ isOpen, onClose }: NewChatDialogProps): JSX.Element | null {
  const { createChat } = useConversationStore();
  const { getDefaultSystemPrompt } = useSettingsStore();

  const [newChatName, setNewChatName] = useState('');
  const [newChatPrompt, setNewChatPrompt] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setNewChatName('');
      setNewChatPrompt(getDefaultSystemPrompt());
    }
  }, [isOpen, getDefaultSystemPrompt]);

  // Handle key press for dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreateChat = async () => {
    const name = newChatName.trim() || 'Untitled';
    try {
      await createChat(name, newChatPrompt.trim() || undefined);
      onClose();
    } catch (error) {
      console.error('Failed to create chat:', error);
      // Don't close dialog on error so user can retry
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative bg-[var(--color-surface)] rounded-lg p-6 w-full max-w-sm mx-4 border border-[var(--color-border)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
      >
        <h3
          id="new-chat-title"
          className="text-lg font-semibold text-[var(--color-text-primary)] mb-4"
        >
          New Chat
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              Chat Name
            </label>
            <input
              type="text"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              placeholder="Untitled"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              System Prompt (Optional)
            </label>
            <textarea
              value={newChatPrompt}
              onChange={(e) => setNewChatPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-background)]"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateChat}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
