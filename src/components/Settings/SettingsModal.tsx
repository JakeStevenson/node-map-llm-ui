import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { fetchModels } from '../../services/llmService';
import { testSearchEndpoint } from '../../services/searchService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps): JSX.Element | null {
  const {
    endpoint,
    apiKey,
    model,
    embeddingEndpoint,
    embeddingApiKey,
    embeddingModel,
    defaultSystemPrompt,
    availableModels,
    isLoadingModels,
    modelsError,
    webSearch,
    serverSearchConfig,
    isLoadingServerSearch,
    setModel,
    updateConfig,
    updateEmbeddingConfig,
    setAvailableModels,
    setIsLoadingModels,
    setModelsError,
    setDefaultSystemPrompt,
    updateWebSearchConfig,
    fetchServerSearchConfig,
  } = useSettingsStore();

  const [localEndpoint, setLocalEndpoint] = useState(endpoint);
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localEmbeddingEndpoint, setLocalEmbeddingEndpoint] = useState(embeddingEndpoint);
  const [localEmbeddingApiKey, setLocalEmbeddingApiKey] = useState(embeddingApiKey);
  const [localEmbeddingModel, setLocalEmbeddingModel] = useState(embeddingModel);
  const [localDefaultPrompt, setLocalDefaultPrompt] = useState(defaultSystemPrompt);

  // Web search local state
  const [localSearchEnabled, setLocalSearchEnabled] = useState(webSearch.enabled);
  const [localSearchMaxResults, setLocalSearchMaxResults] = useState(webSearch.maxResults);
  const [isTestingSearch, setIsTestingSearch] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Fetch server search config on mount
  useEffect(() => {
    if (isOpen) {
      fetchServerSearchConfig();
    }
  }, [isOpen, fetchServerSearchConfig]);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalEndpoint(endpoint);
      setLocalApiKey(apiKey);
      setLocalEmbeddingEndpoint(embeddingEndpoint);
      setLocalEmbeddingApiKey(embeddingApiKey);
      setLocalEmbeddingModel(embeddingModel);
      setLocalDefaultPrompt(defaultSystemPrompt);
      setLocalSearchEnabled(webSearch.enabled);
      setLocalSearchMaxResults(webSearch.maxResults);
      setSearchTestResult(null);
    }
  }, [isOpen, endpoint, apiKey, embeddingEndpoint, embeddingApiKey, embeddingModel, defaultSystemPrompt, webSearch]);

  // Fetch models when endpoint/key changes
  const handleFetchModels = useCallback(async () => {
    if (!localEndpoint) return;

    setIsLoadingModels(true);
    setModelsError(null);

    try {
      const models = await fetchModels({
        endpoint: localEndpoint,
        apiKey: localApiKey,
        model: '',
      });
      setAvailableModels(models);

      // Auto-select first model if none selected
      if (models.length > 0 && !model) {
        setModel(models[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      setModelsError(message);
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [localEndpoint, localApiKey, model, setAvailableModels, setIsLoadingModels, setModelsError, setModel]);

  // Test search endpoint (server-side)
  const handleTestSearch = async () => {
    setIsTestingSearch(true);
    setSearchTestResult(null);

    const result = await testSearchEndpoint();
    setSearchTestResult(result);
    setIsTestingSearch(false);
  };

  // Handle save
  const handleSave = () => {
    updateConfig({
      endpoint: localEndpoint,
      apiKey: localApiKey,
    });
    updateEmbeddingConfig({
      embeddingEndpoint: localEmbeddingEndpoint,
      embeddingApiKey: localEmbeddingApiKey,
      embeddingModel: localEmbeddingModel,
    });
    setDefaultSystemPrompt(localDefaultPrompt);
    updateWebSearchConfig({
      enabled: localSearchEnabled,
      maxResults: localSearchMaxResults,
    });
    onClose();
  };

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

  if (!isOpen) return null;

  const serverSearchAvailable = serverSearchConfig?.enabled ?? false;

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
        className="relative w-full max-w-md mx-4 bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2
            id="settings-title"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            Settings
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Endpoint */}
          <div>
            <label
              htmlFor="endpoint"
              className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
            >
              API Endpoint
            </label>
            <input
              id="endpoint"
              type="url"
              value={localEndpoint}
              onChange={(e) => setLocalEndpoint(e.target.value)}
              placeholder="https://api.your-provider.com/v1"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              OpenAI-compatible API endpoint URL
            </p>
          </div>

          {/* API Key */}
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
            >
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Optional for providers that don't require authentication
            </p>
          </div>

          {/* Fetch Models Button */}
          <div>
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={!localEndpoint || isLoadingModels}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingModels ? 'Loading...' : 'Fetch Models'}
            </button>
          </div>

          {/* Models Error */}
          {modelsError && (
            <p className="text-sm text-[var(--color-error)]">{modelsError}</p>
          )}

          {/* Model Selection */}
          {availableModels.length > 0 && (
            <div>
              <label
                htmlFor="model"
                className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
              >
                Model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              >
                <option value="">Select a model...</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Default System Prompt */}
          <div>
            <label
              htmlFor="defaultPrompt"
              className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
            >
              Default System Prompt (Optional)
            </label>
            <textarea
              id="defaultPrompt"
              value={localDefaultPrompt}
              onChange={(e) => setLocalDefaultPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-y"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              This will be used for new chats. Can be overridden per conversation.
            </p>
          </div>

          {/* Embedding Settings Section */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
              Embedding Settings (Document Search)
            </h3>

            {/* Embedding Endpoint */}
            <div className="mb-3">
              <label
                htmlFor="embeddingEndpoint"
                className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
              >
                Embedding API Endpoint
              </label>
              <input
                id="embeddingEndpoint"
                type="url"
                value={localEmbeddingEndpoint}
                onChange={(e) => setLocalEmbeddingEndpoint(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                OpenAI-compatible embedding endpoint (e.g., Ollama, Groq)
              </p>
            </div>

            {/* Embedding API Key */}
            <div className="mb-3">
              <label
                htmlFor="embeddingApiKey"
                className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
              >
                Embedding API Key
              </label>
              <input
                id="embeddingApiKey"
                type="password"
                value={localEmbeddingApiKey}
                onChange={(e) => setLocalEmbeddingApiKey(e.target.value)}
                placeholder="Optional for Ollama"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Optional for providers that don't require authentication
              </p>
            </div>

            {/* Embedding Model */}
            <div>
              <label
                htmlFor="embeddingModel"
                className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
              >
                Embedding Model
              </label>
              <input
                id="embeddingModel"
                type="text"
                value={localEmbeddingModel}
                onChange={(e) => setLocalEmbeddingModel(e.target.value)}
                placeholder="nomic-embed-text"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Model name for generating embeddings (e.g., nomic-embed-text, text-embedding-3-small)
              </p>
            </div>
          </div>

          {/* Web Search Section */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
              Web Search (Optional)
            </h3>

            {isLoadingServerSearch ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Checking server search config...
              </p>
            ) : serverSearchAvailable ? (
              <>
                {/* Server has search configured */}
                <div className="mb-3 p-2 rounded bg-green-500/10 text-green-400 text-xs">
                  Searxng configured on server (SEARXNG_ENDPOINT)
                </div>

                {/* Enable Toggle */}
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSearchEnabled}
                    onChange={(e) => setLocalSearchEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm text-[var(--color-text-primary)]">
                    Enable web search
                  </span>
                </label>

                {localSearchEnabled && (
                  <>
                    {/* Max Results */}
                    <div className="mb-3">
                      <label
                        htmlFor="maxResults"
                        className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                      >
                        Max Results
                      </label>
                      <select
                        id="maxResults"
                        value={localSearchMaxResults}
                        onChange={(e) => setLocalSearchMaxResults(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                      >
                        {[3, 5, 8, 10].map((n) => (
                          <option key={n} value={n}>
                            {n} results
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Test Button */}
                    <button
                      type="button"
                      onClick={handleTestSearch}
                      disabled={isTestingSearch}
                      className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingSearch ? 'Testing...' : 'Test Connection'}
                    </button>

                    {/* Test Result */}
                    {searchTestResult && (
                      <p
                        className={`mt-2 text-sm ${
                          searchTestResult.success
                            ? 'text-green-500'
                            : 'text-[var(--color-error)]'
                        }`}
                      >
                        {searchTestResult.success
                          ? 'Connection successful!'
                          : searchTestResult.error || 'Connection failed'}
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              /* Server does NOT have search configured */
              <div className="text-sm text-[var(--color-text-secondary)]">
                <p className="mb-2">
                  Web search is not configured on the server.
                </p>
                <p className="text-xs">
                  Set <code className="px-1 py-0.5 bg-[var(--color-background)] rounded">SEARXNG_ENDPOINT</code> environment
                  variable on the server to enable.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] bg-transparent border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
