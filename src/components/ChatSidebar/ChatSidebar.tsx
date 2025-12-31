interface ChatSidebarProps {
  className?: string;
}

export function ChatSidebar({ className = '' }: ChatSidebarProps): JSX.Element {
  return (
    <aside
      className={`flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)] ${className}`}
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Node-Map LLM UI
        </h1>
      </header>

      {/* Message List - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Start a conversation to see messages here...
        </p>
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex gap-2">
          <textarea
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            rows={2}
          />
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Enter to send • Shift+Enter for newline
        </p>
      </div>
    </aside>
  );
}

export default ChatSidebar;
