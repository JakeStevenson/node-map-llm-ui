import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig, LLMModel, WebSearchConfig, ServerSearchConfig, ModelContextConfig } from '../types';
import { getModelConfig } from '../services/contextService';
import { getModelContextWindow } from '../services/modelInfoService';

interface SettingsState {
  // LLM Config
  endpoint: string;
  apiKey: string;
  model: string;

  // Embedding Config
  embeddingEndpoint: string;
  embeddingApiKey: string;
  embeddingModel: string;

  // RAG Config
  ragEnabled: boolean;
  ragTopK: number;
  ragMaxTokens: number;
  ragMinScore: number;

  // Default System Prompt
  defaultSystemPrompt: string;

  // Web Search Config (client preferences)
  webSearch: WebSearchConfig;

  // Server search config (fetched from server)
  serverSearchConfig: ServerSearchConfig | null;
  isLoadingServerSearch: boolean;

  // Context Management Config
  contextConfig: ModelContextConfig;

  // Available models from endpoint
  availableModels: LLMModel[];
  isLoadingModels: boolean;
  modelsError: string | null;

  // LLM Actions
  setEndpoint: (endpoint: string) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => Promise<void>;
  updateConfig: (config: Partial<Pick<SettingsState, 'endpoint' | 'apiKey' | 'model'>>) => void;
  setAvailableModels: (models: LLMModel[]) => void;
  setIsLoadingModels: (loading: boolean) => void;
  setModelsError: (error: string | null) => void;
  getConfig: () => LLMConfig;

  // Embedding Actions
  setEmbeddingEndpoint: (endpoint: string) => void;
  setEmbeddingApiKey: (apiKey: string) => void;
  setEmbeddingModel: (model: string) => void;
  updateEmbeddingConfig: (config: Partial<Pick<SettingsState, 'embeddingEndpoint' | 'embeddingApiKey' | 'embeddingModel'>>) => void;
  getEmbeddingConfig: () => { endpoint: string; apiKey: string; model: string };

  // RAG Actions
  setRagEnabled: (enabled: boolean) => void;
  setRagTopK: (topK: number) => void;
  setRagMaxTokens: (maxTokens: number) => void;
  setRagMinScore: (minScore: number) => void;
  updateRagConfig: (config: Partial<Pick<SettingsState, 'ragEnabled' | 'ragTopK' | 'ragMaxTokens' | 'ragMinScore'>>) => void;
  getRagConfig: () => { enabled: boolean; topK: number; maxTokens: number; minScore: number };

  // Default System Prompt Actions
  setDefaultSystemPrompt: (prompt: string) => void;
  getDefaultSystemPrompt: () => string;

  // Web Search Actions
  setWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchMaxResults: (maxResults: number) => void;
  updateWebSearchConfig: (config: Partial<WebSearchConfig>) => void;
  getWebSearchConfig: () => WebSearchConfig | null;

  // Server search config
  setServerSearchConfig: (config: ServerSearchConfig | null) => void;
  setIsLoadingServerSearch: (loading: boolean) => void;
  fetchServerSearchConfig: () => Promise<void>;

  // Context Management Actions
  setContextConfig: (config: ModelContextConfig) => void;
  updateContextConfig: (config: Partial<ModelContextConfig>) => void;
  getContextConfig: () => ModelContextConfig;
  updateContextForModel: (modelName: string) => void;
}

const DEFAULT_ENDPOINT = '';
const DEFAULT_EMBEDDING_ENDPOINT = 'http://localhost:11434/v1';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

const DEFAULT_RAG_CONFIG = {
  enabled: true,
  topK: 5,
  maxTokens: 2000,
  minScore: 0.3,
};

const DEFAULT_WEB_SEARCH: WebSearchConfig = {
  enabled: false,
  provider: 'searxng',
  maxResults: 5,
};

const DEFAULT_CONTEXT_CONFIG: ModelContextConfig = {
  contextWindow: 4096,
  reservedTokens: 512,
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Default values
      endpoint: DEFAULT_ENDPOINT,
      apiKey: '',
      model: '',
      embeddingEndpoint: DEFAULT_EMBEDDING_ENDPOINT,
      embeddingApiKey: '',
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      ragEnabled: DEFAULT_RAG_CONFIG.enabled,
      ragTopK: DEFAULT_RAG_CONFIG.topK,
      ragMaxTokens: DEFAULT_RAG_CONFIG.maxTokens,
      ragMinScore: DEFAULT_RAG_CONFIG.minScore,
      defaultSystemPrompt: '',
      webSearch: DEFAULT_WEB_SEARCH,
      contextConfig: DEFAULT_CONTEXT_CONFIG,
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
      setModel: async (model) => {
        set({ model });

        // Auto-detect context window for the new model
        const { endpoint, apiKey } = get();
        if (endpoint && model) {
          try {
            const modelInfo = await getModelContextWindow(endpoint, model, apiKey);
            if (modelInfo.contextWindow) {
              set((state) => ({
                contextConfig: {
                  ...state.contextConfig,
                  contextWindow: modelInfo.contextWindow,
                },
              }));
              console.log(`Auto-detected context window: ${modelInfo.contextWindow} tokens (source: ${modelInfo.source})`);
            }
          } catch (error) {
            console.warn('Failed to auto-detect context window:', error);
          }
        }
      },
      updateConfig: (config) => set(config),
      setAvailableModels: (models) => set({ availableModels: models }),
      setIsLoadingModels: (loading) => set({ isLoadingModels: loading }),
      setModelsError: (error) => set({ modelsError: error }),

      getConfig: () => ({
        endpoint: get().endpoint,
        apiKey: get().apiKey,
        model: get().model,
      }),

      // Embedding Actions
      setEmbeddingEndpoint: (endpoint) => set({ embeddingEndpoint: endpoint }),
      setEmbeddingApiKey: (apiKey) => set({ embeddingApiKey: apiKey }),
      setEmbeddingModel: (model) => set({ embeddingModel: model }),
      updateEmbeddingConfig: (config) => set(config),
      getEmbeddingConfig: () => ({
        endpoint: get().embeddingEndpoint,
        apiKey: get().embeddingApiKey,
        model: get().embeddingModel,
      }),

      // RAG Actions
      setRagEnabled: (enabled) => set({ ragEnabled: enabled }),
      setRagTopK: (topK) => set({ ragTopK: topK }),
      setRagMaxTokens: (maxTokens) => set({ ragMaxTokens: maxTokens }),
      setRagMinScore: (minScore) => set({ ragMinScore: minScore }),
      updateRagConfig: (config) => set(config),
      getRagConfig: () => ({
        enabled: get().ragEnabled,
        topK: get().ragTopK,
        maxTokens: get().ragMaxTokens,
        minScore: get().ragMinScore,
      }),

      // Default System Prompt Actions
      setDefaultSystemPrompt: (prompt) => set({ defaultSystemPrompt: prompt }),
      getDefaultSystemPrompt: () => get().defaultSystemPrompt,

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

      // Context Management Actions
      setContextConfig: (config) => set({ contextConfig: config }),

      updateContextConfig: (config) =>
        set((state) => ({
          contextConfig: { ...state.contextConfig, ...config },
        })),

      getContextConfig: () => get().contextConfig,

      updateContextForModel: (modelName) => {
        const modelConfig = getModelConfig(modelName);
        set({ contextConfig: modelConfig });
      },
    }),
    {
      name: 'node-map-settings',
      partialize: (state) => ({
        endpoint: state.endpoint,
        apiKey: state.apiKey,
        model: state.model,
        embeddingEndpoint: state.embeddingEndpoint,
        embeddingApiKey: state.embeddingApiKey,
        embeddingModel: state.embeddingModel,
        ragEnabled: state.ragEnabled,
        ragTopK: state.ragTopK,
        ragMaxTokens: state.ragMaxTokens,
        ragMinScore: state.ragMinScore,
        defaultSystemPrompt: state.defaultSystemPrompt,
        webSearch: state.webSearch,
        contextConfig: state.contextConfig,
      }),
    }
  )
);
