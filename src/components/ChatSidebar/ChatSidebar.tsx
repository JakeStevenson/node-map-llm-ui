import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConversationStore, createUserMessage } from '../../store/conversationStore';
import { useSettingsStore } from '../../store/settingsStore';
import { sendMessageWithSearch, generateBranchSummary } from '../../services/llmService';
import { BranchIcon, SearchIcon } from '../icons';
import type { BranchSummary, SearchMetadata } from '../../types';

interface ChatSidebarProps {
  className?: string;
  style?: React.CSSProperties;
  onOpenSettings: () => void;
  onOpenChats: () => void;
}

export function ChatSidebar({ className = '', style, onOpenSettings, onOpenChats }: ChatSidebarProps): JSX.Element {
  const [input, setInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);  // Manual search toggle
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    isSearching,
    searchQuery,
    error,
    chatName,
    selectedNodeIds,
    nodes,
    activeNodeId,
    addMessage,
    createMergeNode,
    setIsStreaming,
    appendStreamingContent,
    finalizeStreamingWithSearch,
    setIsSearching,
    setError,
    clearTree,
    renameChat,
    clearNodeSelection,
    getMessagesForLLM,
    getMessagesForNode,
    navigateToNode,
    validateMerge,
  } = useConversationStore();

  // Get active node to check for merge summaries
  const activeNode = nodes.find((n) => n.id === activeNodeId);
  const branchSummaries = activeNode?.branchSummaries;

  const showMergeBar = selectedNodeIds.length >= 2;

  const { endpoint, apiKey, model, webSearch, serverSearchConfig, fetchServerSearchConfig } = useSettingsStore();

  // Fetch server search config on mount
  useEffect(() => {
    fetchServerSearchConfig();
  }, [fetchServerSearchConfig]);

  const isConfigured = endpoint && model;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus textarea on mount and after streaming completes
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Refocus after streaming ends
  useEffect(() => {
    if (!isStreaming && isConfigured) {
      textareaRef.current?.focus();
    }
  }, [isStreaming, isConfigured]);

  // Focus name input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Handle starting name edit
  const handleStartEditName = () => {
    setEditedName(chatName);
    setIsEditingName(true);
  };

  // Handle saving name
  const handleSaveName = () => {
    const trimmed = editedName.trim();
    if (trimmed) {
      renameChat(trimmed);
    }
    setIsEditingName(false);
  };

  // Handle name input key press
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

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

    // Get full context for LLM (handles merge nodes with multiple parents)
    const allMessages = getMessagesForLLM();

    // Build search config if user toggled search for this message AND server has search
    const effectiveSearchConfig = (searchEnabled && serverSearchConfig?.enabled)
      ? { enabled: true, provider: 'searxng' as const, maxResults: webSearch.maxResults }
      : null;

    await sendMessageWithSearch({
      config: { endpoint, apiKey, model },
      messages: allMessages,
      webSearchConfig: effectiveSearchConfig,
      searchQuery: searchEnabled ? trimmedInput : undefined,  // Use user's message as query
      onChunk: (chunk) => appendStreamingContent(chunk),
      onSearchStart: (query) => setIsSearching(true, query),
      onSearchComplete: () => setIsSearching(false),
      onDone: (searchMetadata) => {
        finalizeStreamingWithSearch(searchMetadata);
        setSearchEnabled(false);  // Reset toggle after send
      },
      onError: (err) => setError(err.message),
      abortSignal: abortControllerRef.current.signal,
    });
  }, [
    input,
    isStreaming,
    isConfigured,
    endpoint,
    apiKey,
    model,
    webSearch.maxResults,
    serverSearchConfig?.enabled,
    searchEnabled,
    getMessagesForLLM,
    addMessage,
    setIsStreaming,
    appendStreamingContent,
    finalizeStreamingWithSearch,
    setIsSearching,
    setError,
  ]);

  // Handle cancel streaming
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    finalizeStreamingWithSearch();
  }, [finalizeStreamingWithSearch]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle merge branches with summary generation
  const handleMerge = useCallback(async () => {
    if (selectedNodeIds.length < 2 || isMerging) return;

    // Validate merge first
    const validation = validateMerge(selectedNodeIds);
    if (!validation.valid) {
      setError(validation.error || 'Invalid merge');
      return;
    }

    setIsMerging(true);

    try {
      // Generate summaries for each parent branch in parallel
      const summaryPromises = selectedNodeIds.map(async (nodeId): Promise<BranchSummary> => {
        const messages = getMessagesForNode(nodeId);
        const summary = await generateBranchSummary({ endpoint, apiKey, model }, messages);
        return { nodeId, summary };
      });

      const branchSummaries = await Promise.all(summaryPromises);

      // Create merge node with summaries
      createMergeNode(selectedNodeIds, branchSummaries);
    } catch {
      // Still create merge node without summaries on error
      createMergeNode(selectedNodeIds);
    } finally {
      setIsMerging(false);
    }
  }, [selectedNodeIds, isMerging, validateMerge, setError, getMessagesForNode, endpoint, apiKey, model, createMergeNode]);

  return (
    <aside
      className={`flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)] ${className}`}
      style={style}
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
        {/* Editable chat name */}
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyDown}
            className="flex-1 min-w-0 text-lg font-semibold text-[var(--color-text-primary)] bg-transparent border-b-2 border-[var(--color-accent)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEditName}
            className="flex-1 min-w-0 text-left text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent)] truncate transition-colors"
            title="Click to rename"
          >
            {chatName}
          </button>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onOpenChats}
            className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background)] rounded-lg transition-colors"
            aria-label="Open chats"
            title="Saved chats"
          >
            <FolderIcon />
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearTree}
              className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-error)] hover:bg-[var(--color-background)] rounded-lg transition-colors"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <TrashIcon />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background)] rounded-lg transition-colors"
            aria-label="Open settings"
          >
            <SettingsIcon />
          </button>
        </div>
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
        {messages.length === 0 && !streamingContent && !branchSummaries && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Start a conversation...
          </p>
        )}

        {/* Branch Summary Cards (for merge nodes) */}
        {branchSummaries && branchSummaries.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Merged Branches
            </p>
            {branchSummaries.map((summary, index) => (
              <button
                key={summary.nodeId}
                type="button"
                onClick={() => navigateToNode(summary.nodeId)}
                className="w-full text-left p-3 rounded-lg bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">
                    <BranchIcon />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                      Branch {index + 1}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)] line-clamp-2">
                      {summary.summary || 'No summary available'}
                    </p>
                  </div>
                  <span className="text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                    View →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => {
          // Find the corresponding node to get searchMetadata
          const node = nodes.find((n) => n.id === message.id);
          return (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              searchMetadata={node?.searchMetadata}
            />
          );
        })}

        {/* Loading indicator - waiting for first chunk */}
        {isStreaming && !streamingContent && !isSearching && (
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

        {/* Search in progress indicator */}
        {isSearching && searchQuery && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center gap-2">
                <SearchIcon size={14} className="text-blue-500 animate-pulse" />
                <span className="text-sm text-blue-500">
                  Searching: "{searchQuery}"
                </span>
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
          <div className="p-3 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-lg flex items-start justify-between gap-2">
            <p className="text-sm text-[var(--color-error)]">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[var(--color-error)] hover:text-[var(--color-error)]/70 flex-shrink-0"
              aria-label="Dismiss error"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Merge Bar - shows when 2+ nodes selected */}
      {showMergeBar && (
        <div className="px-4 py-3 bg-amber-400/10 border-t border-amber-400/30 flex items-center justify-between">
          <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
            {selectedNodeIds.length} nodes selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearNodeSelection}
              className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={isMerging}
              className="px-3 py-1.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-wait rounded-lg transition-colors flex items-center gap-1.5"
            >
              {isMerging ? (
                <>
                  <LoadingSpinner />
                  Generating summaries...
                </>
              ) : (
                <>
                  <MergeIcon />
                  Merge Branches
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex gap-2 items-stretch">
          {/* Search toggle - only show if server has search configured */}
          {serverSearchConfig?.enabled && (
            <button
              type="button"
              onClick={() => setSearchEnabled(!searchEnabled)}
              disabled={isStreaming}
              className={`w-11 flex-shrink-0 flex items-center justify-center rounded-lg border transition-colors ${
                searchEnabled
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                  : 'bg-[var(--color-background)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-blue-500/40 hover:text-blue-400'
              } disabled:opacity-50`}
              title={searchEnabled ? 'Web search enabled' : 'Search the web'}
              aria-label={searchEnabled ? 'Disable web search' : 'Enable web search'}
            >
              <SearchIcon size={18} />
            </button>
          )}
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
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Enter to send • Shift+Enter for newline
          </p>
          {searchEnabled && serverSearchConfig?.enabled && (
            <p className="text-xs text-blue-400">
              Web search enabled
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

// Message bubble component
function MessageBubble({
  role,
  content,
  isStreaming = false,
  searchMetadata,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  searchMetadata?: SearchMetadata;
}): JSX.Element {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = role === 'user';
  const hasSearch = searchMetadata && searchMetadata.results.length > 0;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm overflow-hidden ${
          isUser
            ? 'bg-[var(--color-accent)] text-white whitespace-pre-wrap break-words'
            : 'bg-[var(--color-background)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
        }`}
      >
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm prose-invert max-w-none overflow-x-auto prose-pre:bg-[var(--color-surface)] prose-pre:border prose-pre:border-[var(--color-border)] prose-pre:overflow-x-auto prose-code:text-[var(--color-accent)] prose-code:before:content-none prose-code:after:content-none prose-p:break-words prose-li:break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse" />
        )}
      </div>

      {/* Sources panel - only for assistant messages with search */}
      {!isUser && hasSearch && (
        <div className="mt-2 max-w-[85%] rounded-lg bg-blue-500/10 border border-blue-500/20 overflow-hidden">
          {/* Clickable header */}
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-blue-500/5 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <SearchIcon size={12} className="text-blue-500" />
              <span className="text-xs font-medium text-blue-500">
                Sources ({searchMetadata.results.length})
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-blue-500 transition-transform ${sourcesExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Expandable content */}
          {sourcesExpanded && (
            <div className="px-3 pb-3 space-y-2 border-t border-blue-500/20">
              {searchMetadata.results.map((result, i) => (
                <div key={i} className="pt-2">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline block"
                  >
                    {result.title}
                  </a>
                  {result.snippet && (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                      {result.snippet}
                    </p>
                  )}
                  <span className="text-[10px] text-[var(--color-text-secondary)] opacity-60 block mt-0.5 truncate">
                    {result.url}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Collapsed preview */}
          {!sourcesExpanded && (
            <div className="px-3 pb-2">
              <p className="text-xs text-[var(--color-text-secondary)] truncate">
                {searchMetadata.results.slice(0, 3).map(r => r.title).join(' • ')}
              </p>
            </div>
          )}
        </div>
      )}
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

// Trash icon
function TrashIcon(): JSX.Element {
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
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

// Folder icon
function FolderIcon(): JSX.Element {
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
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

// Merge icon (git merge style)
function MergeIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

// Loading spinner
function LoadingSpinner(): JSX.Element {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

