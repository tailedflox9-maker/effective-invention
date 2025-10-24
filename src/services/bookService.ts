// src/services/bookService.ts - Enhanced with Robust Retry & Real-time Updates
import { BookProject, BookRoadmap, BookModule, RoadmapModule, BookSession } from '../types/book';
import { APISettings, ModelProvider } from '../types';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced checkpoint with more metadata
interface GenerationCheckpoint {
  bookId: string;
  completedModuleIds: string[];
  failedModuleIds: string[];
  moduleRetryCount: Record<string, number>; // Track retries per module
  lastSuccessfulIndex: number;
  timestamp: Date;
}

// Real-time generation status
interface GenerationStatus {
  currentModule?: {
    id: string;
    title: string;
    attempt: number;
    progress: number; // 0-100 for current module
    generatedText?: string; // Partial content
  };
  totalProgress: number; // Overall progress
  status: 'idle' | 'generating' | 'completed' | 'error';
  message?: string;
}

class BookGenerationService {
  private settings: APISettings = {
    googleApiKey: '',
    zhipuApiKey: '',
    mistralApiKey: '',
    selectedProvider: 'google',
    selectedModel: 'gemini-2.5-flash'
  };

  private onProgressUpdate?: (bookId: string, updates: Partial<BookProject>) => void;
  private onGenerationStatusUpdate?: (bookId: string, status: GenerationStatus) => void;
  private requestTimeout = 180000; // Increased to 3 minutes
  private activeRequests = new Map<string, AbortController>();
  private checkpoints = new Map<string, GenerationCheckpoint>();
  
  // Enhanced retry configuration with exponential backoff
  private readonly MAX_MODULE_RETRIES = 5; // Increased from 3
  private readonly RETRY_DELAY_BASE = 3000; // Increased to 3 seconds
  private readonly MAX_RETRY_DELAY = 30000; // Cap at 30 seconds
  private readonly RATE_LIMIT_DELAY = 5000; // 5 seconds for rate limit errors

  updateSettings(settings: APISettings) {
    this.settings = settings;
    logger.info('BookService settings updated', {
      provider: settings.selectedProvider,
      model: settings.selectedModel
    });
  }

  setProgressCallback(callback: (bookId: string, updates: Partial<BookProject>) => void) {
    this.onProgressUpdate = callback;
  }

  setGenerationStatusCallback(callback: (bookId: string, status: GenerationStatus) => void) {
    this.onGenerationStatusUpdate = callback;
  }

  private updateProgress(bookId: string, updates: Partial<BookProject>) {
    logger.info(`Book ${bookId} progress update`, { status: updates.status, progress: updates.progress });
    if (this.onProgressUpdate) {
      this.onProgressUpdate(bookId, { ...updates, updatedAt: new Date() });
    }
  }

  private updateGenerationStatus(bookId: string, status: GenerationStatus) {
    if (this.onGenerationStatusUpdate) {
      this.onGenerationStatusUpdate(bookId, status);
    }
  }

  // Enhanced checkpoint with retry tracking
  private saveCheckpoint(
    bookId: string, 
    completedModuleIds: string[], 
    failedModuleIds: string[], 
    lastIndex: number,
    moduleRetryCount: Record<string, number> = {}
  ) {
    const checkpoint: GenerationCheckpoint = {
      bookId,
      completedModuleIds,
      failedModuleIds,
      moduleRetryCount,
      lastSuccessfulIndex: lastIndex,
      timestamp: new Date()
    };
    this.checkpoints.set(bookId, checkpoint);
    
    try {
      localStorage.setItem(`checkpoint_${bookId}`, JSON.stringify(checkpoint));
      logger.debug('Checkpoint saved', { 
        bookId, 
        completedCount: completedModuleIds.length,
        failedCount: failedModuleIds.length 
      });
    } catch (error) {
      logger.warn('Failed to save checkpoint to localStorage', error);
    }
  }

  private loadCheckpoint(bookId: string): GenerationCheckpoint | null {
    if (this.checkpoints.has(bookId)) {
      return this.checkpoints.get(bookId)!;
    }
    
    try {
      const stored = localStorage.getItem(`checkpoint_${bookId}`);
      if (stored) {
        const checkpoint = JSON.parse(stored);
        checkpoint.timestamp = new Date(checkpoint.timestamp);
        checkpoint.moduleRetryCount = checkpoint.moduleRetryCount || {};
        return checkpoint;
      }
    } catch (error) {
      logger.warn('Failed to load checkpoint from localStorage', error);
    }
    
    return null;
  }

  private clearCheckpoint(bookId: string) {
    this.checkpoints.delete(bookId);
    try {
      localStorage.removeItem(`checkpoint_${bookId}`);
      logger.debug('Checkpoint cleared', { bookId });
    } catch (error) {
      logger.warn('Failed to clear checkpoint from localStorage', error);
    }
  }

  validateSettings(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.settings.selectedProvider) errors.push('No AI provider selected');
    if (!this.settings.selectedModel) errors.push('No model selected');
    const apiKey = this.getApiKeyForProvider(this.settings.selectedProvider);
    if (!apiKey) errors.push(`No API key configured for ${this.settings.selectedProvider}`);
    return { isValid: errors.length === 0, errors };
  }

  private getApiKeyForProvider(provider: string): string | null {
    switch (provider) {
      case 'google': return this.settings.googleApiKey || null;
      case 'mistral': return this.settings.mistralApiKey || null;
      case 'zhipu': return this.settings.zhipuApiKey || null;
      default: return null;
    }
  }

  private getApiKey(): string {
    const key = this.getApiKeyForProvider(this.settings.selectedProvider);
    if (!key) {
      throw new Error(`${this.settings.selectedProvider} API key not configured. Please add your API key in Settings.`);
    }
    return key;
  }

  // Enhanced error detection
  private isRateLimitError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const statusCode = error?.status || error?.response?.status;
    
    return (
      statusCode === 429 ||
      statusCode === 503 ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('resource exhausted')
    );
  }

  private isNetworkError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('connection') ||
      error?.name === 'NetworkError'
    );
  }

  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.MAX_MODULE_RETRIES) return false;
    
    // Always retry rate limits and network errors
    if (this.isRateLimitError(error) || this.isNetworkError(error)) {
      return true;
    }
    
    // Retry on temporary errors
    const errorMessage = error?.message?.toLowerCase() || '';
    const retryableErrors = [
      'timeout',
      'overloaded',
      'unavailable',
      'internal error',
      'bad gateway'
    ];
    
    return retryableErrors.some(msg => errorMessage.includes(msg));
  }

  private calculateRetryDelay(attempt: number, isRateLimit: boolean): number {
    if (isRateLimit) {
      return this.RATE_LIMIT_DELAY * Math.pow(1.5, attempt);
    }
    
    // Exponential backoff with jitter
    const exponentialDelay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add random jitter
    const delay = Math.min(exponentialDelay + jitter, this.MAX_RETRY_DELAY);
    
    return delay;
  }

  // Enhanced API generation with streaming simulation
  private async generateWithAI(prompt: string, bookId?: string, onChunk?: (chunk: string) => void): Promise<string> {
    const validation = this.validateSettings();
    if (!validation.isValid) {
      throw new Error(`Configuration error: ${validation.errors.join(', ')}`);
    }

    if (!navigator.onLine) {
      throw new Error('No internet connection. Please check your connection and try again.');
    }

    const requestId = bookId || generateId();
    const abortController = new AbortController();
    this.activeRequests.set(requestId, abortController);

    const timeoutId = setTimeout(() => {
      abortController.abort();
      this.activeRequests.delete(requestId);
    }, this.requestTimeout);

    try {
      let result: string;
      switch (this.settings.selectedProvider) {
        case 'google': 
          result = await this.generateWithGoogle(prompt, abortController.signal, onChunk); 
          break;
        case 'mistral': 
          result = await this.generateWithMistral(prompt, abortController.signal, onChunk); 
          break;
        case 'zhipu': 
          result = await this.generateWithZhipu(prompt, abortController.signal, onChunk); 
          break;
        default: 
          throw new Error(`Unsupported provider: ${this.settings.selectedProvider}`);
      }
      return result;
    } finally {
      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);
    }
  }

  // Enhanced Google API with chunk callback
  private async generateWithGoogle(prompt: string, signal?: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 8192 }
            }),
            signal
          }
        );

        if (response.status === 429 || response.status === 503) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`Google API overloaded (${response.status}). Retrying in ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData?.error?.message || `HTTP ${response.status}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Invalid response from Google API');
        
        // Simulate streaming for UI feedback
        if (onChunk) {
          const words = text.split(' ');
          const chunkSize = Math.max(5, Math.floor(words.length / 20));
          for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
            onChunk(chunk);
            await sleep(50); // Small delay for visual effect
          }
        }
        
        return text;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        attempt++;
        if (attempt >= maxRetries) throw error;
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('Google API failed after retries');
  }

  // Similar enhancements for Mistral and Zhipu (keeping existing logic)
  private async generateWithMistral(prompt: string, signal?: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    // Existing implementation with chunk support
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192
      }),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData?.error?.message || `Mistral API Error: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Invalid response from Mistral API');
    
    if (onChunk) {
      const words = text.split(' ');
      const chunkSize = Math.max(5, Math.floor(words.length / 20));
      for (let i = 0; i < words.length; i += chunkSize) {
        onChunk(words.slice(i, i + chunkSize).join(' ') + ' ');
        await sleep(50);
      }
    }
    
    return text;
  }

  private async generateWithZhipu(prompt: string, signal?: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    // Existing implementation with chunk support
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192,
        stream: false
      }),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData?.error?.message || `ZhipuAI API Error: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Invalid response from ZhipuAI API');
    
    if (onChunk) {
      const words = text.split(' ');
      const chunkSize = Math.max(5, Math.floor(words.length / 20));
      for (let i = 0; i < words.length; i += chunkSize) {
        onChunk(words.slice(i, i + chunkSize).join(' ') + ' ');
        await sleep(50);
      }
    }
    
    return text;
  }

  // Enhanced module generation with real-time updates
  async generateModuleContentWithRetry(
    book: BookProject,
    roadmapModule: RoadmapModule,
    session: BookSession,
    attemptNumber: number = 1
  ): Promise<BookModule> {
    logger.info('Generating module content', {
      bookId: book.id,
      moduleTitle: roadmapModule.title,
      attempt: attemptNumber
    });

    // Update generation status
    this.updateGenerationStatus(book.id, {
      currentModule: {
        id: roadmapModule.id,
        title: roadmapModule.title,
        attempt: attemptNumber,
        progress: 0
      },
      totalProgress: 0,
      status: 'generating',
      message: `Generating: ${roadmapModule.title} (Attempt ${attemptNumber}/${this.MAX_MODULE_RETRIES})`
    });

    try {
      const previousModules = book.modules.filter(m => m.status === 'completed');
      const isFirstModule = previousModules.length === 0;
      const moduleIndex = roadmapModule.order;
      const totalModules = book.roadmap?.totalModules || 0;

      const prompt = this.buildModulePrompt(session, roadmapModule, previousModules, isFirstModule, moduleIndex, totalModules);
      
      let generatedText = '';
      const moduleContent = await this.generateWithAI(prompt, book.id, (chunk) => {
        generatedText += chunk;
        const progress = Math.min(95, (generatedText.length / 3000) * 100); // Estimate progress
        
        this.updateGenerationStatus(book.id, {
          currentModule: {
            id: roadmapModule.id,
            title: roadmapModule.title,
            attempt: attemptNumber,
            progress,
            generatedText: generatedText.substring(0, 500) + '...' // Preview
          },
          totalProgress: 0,
          status: 'generating'
        });
      });

      const wordCount = moduleContent.split(/\s+/).filter(word => word.length > 0).length;

      if (wordCount < 300) {
        throw new Error(`Generated content too short (${wordCount} words). Minimum 300 words required.`);
      }

      const module: BookModule = {
        id: generateId(),
        roadmapModuleId: roadmapModule.id,
        title: roadmapModule.title,
        content: moduleContent.trim(),
        wordCount,
        status: 'completed',
        generatedAt: new Date()
      };

      // Update status to completed for this module
      this.updateGenerationStatus(book.id, {
        currentModule: {
          id: roadmapModule.id,
          title: roadmapModule.title,
          attempt: attemptNumber,
          progress: 100
        },
        totalProgress: 0,
        status: 'generating',
        message: `✓ Completed: ${roadmapModule.title}`
      });

      logger.info('Module generation successful', {
        moduleId: module.id,
        wordCount: module.wordCount
      });

      return module;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRateLimit = this.isRateLimitError(error);
      
      if (this.shouldRetry(error, attemptNumber)) {
        const delay = this.calculateRetryDelay(attemptNumber, isRateLimit);
        
        logger.warn(`Module generation attempt ${attemptNumber} failed, retrying in ${Math.round(delay / 1000)}s`, {
          module: roadmapModule.title,
          error: errorMessage,
          isRateLimit
        });
        
        // Update status with retry info
        this.updateGenerationStatus(book.id, {
          currentModule: {
            id: roadmapModule.id,
            title: roadmapModule.title,
            attempt: attemptNumber,
            progress: 0
          },
          totalProgress: 0,
          status: 'generating',
          message: `⚠️ Retry in ${Math.round(delay / 1000)}s: ${roadmapModule.title} (Attempt ${attemptNumber + 1}/${this.MAX_MODULE_RETRIES})`
        });
        
        await sleep(delay);
        return this.generateModuleContentWithRetry(book, roadmapModule, session, attemptNumber + 1);
      }

      logger.error('Module generation failed after all retries', {
        moduleTitle: roadmapModule.title,
        error: errorMessage
      });

      return {
        id: generateId(),
        roadmapModuleId: roadmapModule.id,
        title: roadmapModule.title,
        content: '',
        wordCount: 0,
        status: 'error',
        error: errorMessage,
        generatedAt: new Date()
      };
    }
  }

  // Rest of the methods remain the same...
  // (Include all other methods from the original bookService.ts)

  cancelActiveRequests(bookId?: string): void {
    if (bookId && this.activeRequests.has(bookId)) {
      this.activeRequests.get(bookId)?.abort();
      this.activeRequests.delete(bookId);
    } else {
      this.activeRequests.forEach(controller => controller.abort());
      this.activeRequests.clear();
    }
  }

  hasCheckpoint(bookId: string): boolean {
    return this.checkpoints.has(bookId) || localStorage.getItem(`checkpoint_${bookId}`) !== null;
  }

  getCheckpointInfo(bookId: string): { completed: number; failed: number; total: number } | null {
    const checkpoint = this.loadCheckpoint(bookId);
    if (!checkpoint) return null;
    
    return {
      completed: checkpoint.completedModuleIds.length,
      failed: checkpoint.failedModuleIds.length,
      total: checkpoint.completedModuleIds.length + checkpoint.failedModuleIds.length
    };
  }

  // Placeholder for other methods - copy from original
  async generateRoadmap(session: BookSession, bookId: string): Promise<BookRoadmap> {
    // Copy from original
    throw new Error('Not implemented in snippet');
  }

  async generateAllModulesWithRecovery(book: BookProject, session: BookSession): Promise<void> {
    // Copy from original with enhanced retry
    throw new Error('Not implemented in snippet');
  }

  async retryFailedModules(book: BookProject, session: BookSession): Promise<void> {
    // Copy from original
    throw new Error('Not implemented in snippet');
  }

  async assembleFinalBook(book: BookProject, session: BookSession): Promise<void> {
    // Copy from original
    throw new Error('Not implemented in snippet');
  }

  downloadAsMarkdown(project: BookProject): void {
    // Copy from original
  }

  private buildModulePrompt(...args: any[]): string {
    // Copy from original
    return '';
  }

  private buildRoadmapPrompt(session: BookSession): string {
    // Copy from original
    return '';
  }

  private async parseRoadmapResponse(response: string, session: BookSession): Promise<BookRoadmap> {
    // Copy from original
    throw new Error('Not implemented');
  }
}

export const bookService = new BookGenerationService();
