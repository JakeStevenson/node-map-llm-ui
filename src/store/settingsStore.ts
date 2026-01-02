import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig, LLMModel, WebSearchConfig, ServerSearchConfig } from '../types';

interface SettingsState {
  // Config
  endpoint: string;
  apiKey: string;
  model: string;

  // Web Search Config (client preferences)
  webSearch: WebSearchConfig;

  // Server search config (fetched from server)
  serverSearchConfig: ServerSearchConfig | null;
  isLoadingServerSearch: boolean;

  // Available models from endpoint
  availableModels: LLMModel[];
  isLoadingModels: boolean;
  modelsError: string | null;

  // Actions
  setEndpoint: (endpoint: string) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
  updateConfig: (config: Partial<Pick<SettingsState, 'endpoint' | 'apiKey' | 'model'>>) => void;
  setAvailableModels: (models: LLMModel[]) => void;
  setIsLoadingModels: (loading: boolean) => void;
  setModelsError: (error: string | null) => void;
  getConfig: () => LLMConfig;

  // Web Search Actions
  setWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchMaxResults: (maxResults: number) => void;
  updateWebSearchConfig: (config: Partial<WebSearchConfig>) => void;
  getWebSearchConfig: () => WebSearchConfig | null;

  // Server search config
  setServerSearchConfig: (config: ServerSearchConfig | null) => void;
  setIsLoadingServerSearch: (loading: boolean) => void;
  fetchServerSearchConfig: () => Promise<void>;
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1';

const DEFAULT_WEB_SEARCH: WebSearchConfig = {
  enabled: false,
  provider: 'searxng',
  maxResults: 5,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Default values
      endpoint: DEFAULT_ENDPOINT,
      apiKey: '',
      model: '',
      webSearch: DEFAULT_WEB_SEARCH,
      serverSearchConfig: null,
      isLoadingServerSearch: false,
      availableModels: [],
      isLoadingModels: false,
      modelsError: null,

      // Actions
      setEndpoint: (endpoint) => {
        const current = get().endpoint;
        if (endpoint !== current) {
          // Only clear model/models if endpoint actually changed
          set({ endpoint, availableModels: [], model: '' });
        }
      },
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      updateConfig: (config) => set(config),
      setAvailableModels: (models) => set({ availableModels: models }),
      setIsLoadingModels: (loading) => set({ isLoadingModels: loading }),
      setModelsError: (error) => set({ modelsError: error }),

      getConfig: () => ({
        endpoint: get().endpoint,
        apiKey: get().apiKey,
        model: get().model,
      }),

      // Web Search Actions
      setWebSearchEnabled: (enabled) =>
        set((state) => ({
          webSearch: { ...state.webSearch, enabled },
        })),

      setWebSearchMaxResults: (maxResults) =>
        set((state) => ({
          webSearch: { ...state.webSearch, maxResults },
        })),

      updateWebSearchConfig: (config) =>
        set((state) => ({
          webSearch: { ...state.webSearch, ...config },
        })),

      getWebSearchConfig: () => {
        const { webSearch, serverSearchConfig } = get();
        // Return null if server doesn't have search configured or user hasn't enabled it
        if (!serverSearchConfig?.enabled || !webSearch.enabled) {
          return null;
        }
        return webSearch;
      },

      // Server search config
      setServerSearchConfig: (config) => set({ serverSearchConfig: config }),
      setIsLoadingServerSearch: (loading) => set({ isLoadingServerSearch: loading }),

      fetchServerSearchConfig: async () => {
        set({ isLoadingServerSearch: true });
        try {
          const response = await fetch('/api/search/config');
          if (response.ok) {
            const config: ServerSearchConfig = await response.json();
            set({ serverSearchConfig: config });
          } else {
            set({ serverSearchConfig: null });
          }
        } catch {
          set({ serverSearchConfig: null });
        } finally {
          set({ isLoadingServerSearch: false });
        }
      },
    }),
    {
      name: 'node-map-settings',
      partialize: (state) => ({
        endpoint: state.endpoint,
        apiKey: state.apiKey,
        model: state.model,
        webSearch: state.webSearch,
      }),
    }
  )
);
