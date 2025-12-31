import { useState, useRef, useEffect, useCallback } from 'react';
import { useConversationStore, createUserMessage } from '../../store/conversationStore';
import { useSettingsStore } from '../../store/settingsStore';
import { sendMessage } from '../../services/llmService';

interface ChatSidebarProps {
  className?: string;
  onOpenSettings: () => void;
}

export function ChatSidebar({ className = '', onOpenSettings }: ChatSidebarProps): JSX.Element {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    addMessage,
    setIsStreaming,
    appendStreamingContent,
    finalizeStreaming,
    setError,
  } = useConversationStore();

  const { endpoint, apiKey, model } = useSettingsStore();

  const isConfigured = endpoint && model;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Handle send message
  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming || !isConfigured) return;

    // Add user message
    const userMessage = createUserMessage(trimmedInput);
    addMessage(userMessage);
    setInput('');
    setError(null);

    // Start streaming
    setIsStreaming(true);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Get all messages including the new one
    const allMessages = [...messages, userMessage];

    await sendMessage(
      { endpoint, apiKey, model },
      allMessages,
      (chunk) => appendStreamingContent(chunk),
      () => finalizeStreaming(),
      (err) => setError(err.message),
      abortControllerRef.current.signal
    );
  }, [
    input,
    isStreaming,
    isConfigured,
    endpoint,
    apiKey,
    model,
    messages,
    addMessage,
    setIsStreaming,
    appendStreamingContent,
    finalizeStreaming,
    setError,
  ]);

  // Handle cancel streaming
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    finalizeStreaming();
  }, [finalizeStreaming]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside
      className={`flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)] ${className}`}
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Node-Map LLM UI
        </h1>
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background)] rounded-lg transition-colors"
          aria-label="Open settings"
        >
          <SettingsIcon />
        </button>
      </header>

      {/* Config Warning */}
      {!isConfigured && (
        <div className="px-4 py-3 bg-[var(--color-warning)]/10 border-b border-[var(--color-warning)]/20">
          <p className="text-sm text-[var(--color-warning)]">
            Configure your API endpoint and model in{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="underline hover:no-underline"
            >
              Settings
            </button>
          </p>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingContent && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Start a conversation...
          </p>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} content={message.content} />
        ))}

        {/* Loading indicator - waiting for first chunk */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)]">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-[var(--color-text-secondary)] rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        {/* Streaming message */}
        {streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} isStreaming />
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-lg">
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConfigured ? 'Type a message...' : 'Configure settings first...'}
            disabled={!isConfigured || isStreaming}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            rows={2}
            aria-label="Message input"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-error)] rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-error)] focus:ring-offset-2"
              aria-label="Cancel"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !isConfigured}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              Send
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Enter to send • Shift+Enter for newline
        </p>
      </div>
    </aside>
  );
}

// Message bubble component
function MessageBubble({
  role,
  content,
  isStreaming = false,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
}): JSX.Element {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-background)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
        }`}
      >
        {content}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse" />
        )}
      </div>
    </div>
  );
}

// Settings icon
function SettingsIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
