// src/utils/storage.ts
import { APISettings, BookProject } from '../types';

const SETTINGS_KEY = 'pustakam-settings';
const BOOKS_KEY = 'pustakam-books';

const defaultSettings: APISettings = {
  googleApiKey: '',
  zhipuApiKey: '',
  mistralApiKey: '',
  selectedProvider: 'google',
  selectedModel: 'gemini-2.5-flash',
};

export const storageUtils = {
  getSettings(): APISettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) return defaultSettings;

      const parsed = JSON.parse(stored);

      // Enhanced validation with logging
      const settings: APISettings = {
        ...defaultSettings,
        ...parsed,
      };

      // Validate selectedProvider with better error handling
      if (!settings.selectedProvider || !['google', 'mistral', 'zhipu'].includes(settings.selectedProvider)) {
        console.warn('Invalid selectedProvider found in storage:', settings.selectedProvider);
        settings.selectedProvider = defaultSettings.selectedProvider;
      }

      // Validate selectedModel exists for the provider
      const validModels = {
        google: ['gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.5-pro'],
        mistral: ['open-mistral-7b', 'open-mixtral-8x7b', 'mistral-small-latest', 'mistral-large-latest'],
        zhipu: ['glm-4.5-flash']
      };

      const providerModels = validModels[settings.selectedProvider];
      if (!providerModels.includes(settings.selectedModel)) {
        console.warn(`Invalid model ${settings.selectedModel} for provider ${settings.selectedProvider}`);
        settings.selectedModel = providerModels[0]; // Use first valid model
      }

      return settings;
    } catch (error) {
      console.error('Error loading settings:', error);
      localStorage.removeItem(SETTINGS_KEY); // Clear corrupted settings
      return defaultSettings;
    }
  },

  saveSettings(settings: APISettings): void {
    try {
      // Validate before saving
      if (!settings.selectedProvider || !['google', 'mistral', 'zhipu'].includes(settings.selectedProvider)) {
        console.error('Attempted to save invalid selectedProvider:', settings.selectedProvider);
        settings.selectedProvider = defaultSettings.selectedProvider;
      }

      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      console.log('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  },

  getBooks(): BookProject[] {
    try {
      const stored = localStorage.getItem(BOOKS_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      return parsed.map((book: any) => ({
        ...book,
        createdAt: new Date(book.createdAt),
        updatedAt: new Date(book.updatedAt),
        modules: book.modules?.map((module: any) => ({
          ...module,
          generatedAt: module.generatedAt ? new Date(module.generatedAt) : undefined,
        })) || [],
      }));
    } catch (error) {
      console.error('Error loading books:', error);
      return [];
    }
  },

  saveBooks(books: BookProject[]): void {
    try {
      localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
    } catch (error) {
      console.error('Error saving books:', error);
      throw error;
    }
  },

  clearAllData(): void {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(BOOKS_KEY);
  }
};
