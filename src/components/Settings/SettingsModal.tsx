import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { fetchModels } from '../../services/llmService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps): JSX.Element | null {
  const {
    endpoint,
    apiKey,
    model,
    availableModels,
    isLoadingModels,
    modelsError,
    setModel,
    updateConfig,
    setAvailableModels,
    setIsLoadingModels,
    setModelsError,
  } = useSettingsStore();

  const [localEndpoint, setLocalEndpoint] = useState(endpoint);
  const [localApiKey, setLocalApiKey] = useState(apiKey);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalEndpoint(endpoint);
      setLocalApiKey(apiKey);
    }
  }, [isOpen, endpoint, apiKey]);

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

  // Handle save
  const handleSave = () => {
    updateConfig({
      endpoint: localEndpoint,
      apiKey: localApiKey,
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
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              OpenAI-compatible endpoint (OpenAI, Ollama, etc.)
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
              Leave empty for local endpoints like Ollama
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
