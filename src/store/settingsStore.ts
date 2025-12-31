import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig, LLMModel } from '../types';

interface SettingsState {
  // Config
  endpoint: string;
  apiKey: string;
  model: string;

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
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Default values
      endpoint: DEFAULT_ENDPOINT,
      apiKey: '',
      model: '',
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
    }),
    {
      name: 'node-map-settings',
      partialize: (state) => ({
        endpoint: state.endpoint,
        apiKey: state.apiKey,
        model: state.model,
      }),
    }
  )
);
