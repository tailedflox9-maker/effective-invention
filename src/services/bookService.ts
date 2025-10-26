// src/services/bookService.ts - REAL SSE STREAMING VERSION
import { BookProject, BookRoadmap, BookModule, RoadmapModule, BookSession } from '../types/book';
import { APISettings, ModelProvider } from '../types';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GenerationCheckpoint {
  bookId: string;
  completedModuleIds: string[];
  failedModuleIds: string[];
  moduleRetryCount: Record<string, number>;
  lastSuccessfulIndex: number;
  timestamp: Date;
}

export interface GenerationStatus {
  currentModule?: {
    id: string;
    title: string;
    attempt: number;
    progress: number;
    generatedText?: string;
  };
  totalProgress: number;
  status: 'idle' | 'generating' | 'completed' | 'error';
  logMessage?: string;
  totalWordsGenerated?: number;
  aiStage?: 'analyzing' | 'writing' | 'examples' | 'polishing' | 'complete';
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
  private requestTimeout = 180000;
  private activeRequests = new Map<string, AbortController>();
  private checkpoints = new Map<string, GenerationCheckpoint>();
  private currentGeneratedTexts = new Map<string, string>();
  
  private readonly MAX_MODULE_RETRIES = 5;
  private readonly RETRY_DELAY_BASE = 3000;
  private readonly MAX_RETRY_DELAY = 30000;
  private readonly RATE_LIMIT_DELAY = 5000;

  updateSettings(settings: APISettings) {
    this.settings = settings;
    logger.info('BookService settings updated', {
      provider: settings.selectedProvider,
      model: settings.selectedModel
    }, 'BookService');
  }

  setProgressCallback(callback: (bookId: string, updates: Partial<BookProject>) => void) {
    this.onProgressUpdate = callback;
  }

  setGenerationStatusCallback(callback: (bookId: string, status: GenerationStatus) => void) {
    this.onGenerationStatusUpdate = callback;
  }

  private updateProgress(bookId: string, updates: Partial<BookProject>) {
    logger.info(`Book ${bookId} progress update`, { status: updates.status, progress: updates.progress }, 'BookService');
    if (this.onProgressUpdate) {
      this.onProgressUpdate(bookId, { ...updates, updatedAt: new Date() });
    }
  }

  private updateGenerationStatus(bookId: string, status: GenerationStatus) {
    if (this.onGenerationStatusUpdate) {
      this.onGenerationStatusUpdate(bookId, status);
    }
  }

  private getCurrentGeneratedText(bookId: string): string {
    return this.currentGeneratedTexts.get(bookId) || '';
  }

  private clearCurrentGeneratedText(bookId: string): void {
    this.currentGeneratedTexts.delete(bookId);
  }

  // CHECKPOINT METHODS (unchanged)
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
      }, 'Checkpoint');
    } catch (error) {
      logger.warn('Failed to save checkpoint to localStorage', error, 'Checkpoint');
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
      logger.warn('Failed to load checkpoint from localStorage', error, 'Checkpoint');
    }
    
    return null;
  }

  private clearCheckpoint(bookId: string) {
    this.checkpoints.delete(bookId);
    try {
      localStorage.removeItem(`checkpoint_${bookId}`);
      logger.debug('Checkpoint cleared', { bookId }, 'Checkpoint');
    } catch (error) {
      logger.warn('Failed to clear checkpoint from localStorage', error, 'Checkpoint');
    }
  }

  // VALIDATION METHODS (unchanged)
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

  // ERROR HANDLING METHODS (unchanged)
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
    
    if (this.isRateLimitError(error) || this.isNetworkError(error)) {
      return true;
    }
    
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
    
    const exponentialDelay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    const delay = Math.min(exponentialDelay + jitter, this.MAX_RETRY_DELAY);
    
    return delay;
  }

  // AI GENERATION CORE METHOD
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

  // ============================================================================
  // REAL SSE STREAMING - GOOGLE GEMINI
  // ============================================================================
  private async generateWithGoogle(prompt: string, signal?: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    const maxRetries = 3;
    let attempt = 0;
    const startTime = Date.now();

    logger.api('Initiating Google AI streaming request', {
      provider: 'Google Gemini',
      model,
      promptLength: prompt.length,
      streaming: !!onChunk,
      attempt: 1
    }, 'GoogleAI');

    while (attempt < maxRetries) {
      try {
        const requestStartTime = Date.now();
        
        // Use streaming endpoint
        const streamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
        
        const response = await fetch(streamEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              temperature: 0.7, 
              topK: 40, 
              topP: 0.95, 
              maxOutputTokens: 8192 
            }
          }),
          signal
        });

        const requestDuration = Date.now() - requestStartTime;

        if (response.status === 429 || response.status === 503) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`Google API rate limited (${response.status}). Retrying in ${Math.round(delay / 1000)}s...`, {
            statusCode: response.status,
            retryDelay: delay,
            attempt: attempt + 1
          }, 'GoogleAI');
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData?.error?.message || `HTTP ${response.status}`);
          (error as any).status = response.status;
          logger.error(`Google AI streaming request failed`, {
            statusCode: response.status,
            error: errorData?.error?.message,
            duration: requestDuration
          }, 'GoogleAI');
          throw error;
        }

        // REAL STREAMING IMPLEMENTATION
        if (!response.body) {
          throw new Error('Response body is null - streaming not supported');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        logger.debug('Starting stream processing', {}, 'GoogleAI');

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            logger.debug('Stream completed', { totalLength: fullContent.length }, 'GoogleAI');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Google's SSE format: "data: {...}\n\n"
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('data: ')) {
              const jsonStr = trimmedLine.substring(6); // Remove "data: " prefix
              
              if (jsonStr === '[DONE]') {
                continue;
              }

              try {
                const data = JSON.parse(jsonStr);
                
                // Extract text from Gemini stream chunk
                const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                
                if (textPart) {
                  fullContent += textPart;
                  
                  // Call onChunk immediately with the new text
                  if (onChunk) {
                    onChunk(textPart);
                  }
                }
              } catch (parseError) {
                logger.warn('Failed to parse stream chunk', { 
                  error: parseError instanceof Error ? parseError.message : 'Unknown',
                  line: jsonStr.substring(0, 100) 
                }, 'GoogleAI');
              }
            }
          }
        }

        if (!fullContent) {
          throw new Error('No content generated from stream');
        }

        const totalDuration = Date.now() - startTime;
        logger.api('Google AI streaming completed successfully', {
          provider: 'Google Gemini',
          model,
          promptLength: prompt.length,
          responseLength: fullContent.length,
          duration: totalDuration,
          wordCount: fullContent.split(/\s+/).length
        }, 'GoogleAI');
        
        return fullContent;

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.warn('Google AI request aborted by user', {}, 'GoogleAI');
          throw error;
        }
        attempt++;
        if (attempt >= maxRetries) {
          logger.error(`Google AI request failed after ${maxRetries} attempts`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'GoogleAI');
          throw error;
        }
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('Google API failed after retries');
  }

  // ============================================================================
  // REAL SSE STREAMING - MISTRAL AI
  // ============================================================================
  private async generateWithMistral(prompt: string, signal?: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    const maxRetries = 3;
    let attempt = 0;
    const startTime = Date.now();

    logger.api('Initiating Mistral AI streaming request', {
      provider: 'Mistral AI',
      model,
      promptLength: prompt.length,
      streaming: !!onChunk,
      attempt: 1
    }, 'MistralAI');

    while (attempt < maxRetries) {
      try {
        const requestStartTime = Date.now();

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiKey}` 
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 8192,
            stream: true // Enable streaming
          }),
          signal
        });

        const requestDuration = Date.now() - requestStartTime;

        if (response.status === 429) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Mistral API rate limited. Retrying in ${Math.round(delay / 1000)}s...`, {
            statusCode: response.status,
            retryDelay: delay,
            attempt: attempt + 1
          }, 'MistralAI');
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData?.error?.message || `Mistral API Error: ${response.status}`);
          (error as any).status = response.status;
          logger.error(`Mistral AI streaming request failed`, {
            statusCode: response.status,
            error: errorData?.error?.message,
            duration: requestDuration
          }, 'MistralAI');
          throw error;
        }

        // REAL STREAMING IMPLEMENTATION
        if (!response.body) {
          throw new Error('Response body is null - streaming not supported');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        logger.debug('Starting stream processing', {}, 'MistralAI');

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            logger.debug('Stream completed', { totalLength: fullContent.length }, 'MistralAI');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Mistral SSE format: "data: {...}\n\n"
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('data: ')) {
              const jsonStr = trimmedLine.substring(6);
              
              if (jsonStr === '[DONE]') {
                continue;
              }

              try {
                const data = JSON.parse(jsonStr);
                
                // Extract text from Mistral stream chunk
                const textPart = data?.choices?.[0]?.delta?.content || '';
                
                if (textPart) {
                  fullContent += textPart;
                  
                  if (onChunk) {
                    onChunk(textPart);
                  }
                }
              } catch (parseError) {
                logger.warn('Failed to parse stream chunk', { 
                  error: parseError instanceof Error ? parseError.message : 'Unknown',
                  line: jsonStr.substring(0, 100) 
                }, 'MistralAI');
              }
            }
          }
        }

        if (!fullContent) {
          throw new Error('No content generated from stream');
        }

        const totalDuration = Date.now() - startTime;
        logger.api('Mistral AI streaming completed successfully', {
          provider: 'Mistral AI',
          model,
          promptLength: prompt.length,
          responseLength: fullContent.length,
          duration: totalDuration,
          wordCount: fullContent.split(/\s+/).length
        }, 'MistralAI');
        
        return fullContent;

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.warn('Mistral AI request aborted by user', {}, 'MistralAI');
          throw error;
        }
        attempt++;
        if (attempt >= maxRetries) {
          logger.error(`Mistral AI request failed after ${maxRetries} attempts`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'MistralAI');
          throw error;
        }
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('Mistral API failed after retries');
  }

  // ============================================================================
  // REAL SSE STREAMING - ZHIPU AI
  // ============================================================================
  private async generateWithZhipu(prompt: string, signal?: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    const maxRetries = 3;
    let attempt = 0;
    const startTime = Date.now();

    logger.api('Initiating ZhipuAI streaming request', {
      provider: 'ZhipuAI',
      model,
      promptLength: prompt.length,
      streaming: !!onChunk,
      attempt: 1
    }, 'ZhipuAI');

    while (attempt < maxRetries) {
      try {
        const requestStartTime = Date.now();

        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiKey}` 
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 8192,
            stream: true // Enable streaming
          }),
          signal
        });

        const requestDuration = Date.now() - requestStartTime;

        if (response.status === 429 || response.status === 503) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`ZhipuAI rate limited. Retrying in ${Math.round(delay / 1000)}s...`, {
            statusCode: response.status,
            retryDelay: delay,
            attempt: attempt + 1
          }, 'ZhipuAI');
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData?.error?.message || `ZhipuAI API Error: ${response.status}`);
          (error as any).status = response.status;
          logger.error(`ZhipuAI streaming request failed`, {
            statusCode: response.status,
            error: errorData?.error?.message,
            duration: requestDuration
          }, 'ZhipuAI');
          throw error;
        }

        // REAL STREAMING IMPLEMENTATION
        if (!response.body) {
          throw new Error('Response body is null - streaming not supported');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        logger.debug('Starting stream processing', {}, 'ZhipuAI');

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            logger.debug('Stream completed', { totalLength: fullContent.length }, 'ZhipuAI');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // ZhipuAI SSE format: "data: {...}\n\n"
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('data: ')) {
              const jsonStr = trimmedLine.substring(6);
              
              if (jsonStr === '[DONE]') {
                continue;
              }

              try {
                const data = JSON.parse(jsonStr);
                
                // Extract text from ZhipuAI stream chunk
                const textPart = data?.choices?.[0]?.delta?.content || '';
                
                if (textPart) {
                  fullContent += textPart;
                  
                  if (onChunk) {
                    onChunk(textPart);
                  }
                }
              } catch (parseError) {
                logger.warn('Failed to parse stream chunk', { 
                  error: parseError instanceof Error ? parseError.message : 'Unknown',
                  line: jsonStr.substring(0, 100) 
                }, 'ZhipuAI');
              }
            }
          }
        }

        if (!fullContent) {
          throw new Error('No content generated from stream');
        }

        const totalDuration = Date.now() - startTime;
        logger.api('ZhipuAI streaming completed successfully', {
          provider: 'ZhipuAI',
          model,
          promptLength: prompt.length,
          responseLength: fullContent.length,
          duration: totalDuration,
          wordCount: fullContent.split(/\s+/).length
        }, 'ZhipuAI');
        
        return fullContent;

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.warn('ZhipuAI request aborted by user', {}, 'ZhipuAI');
          throw error;
        }
        attempt++;
        if (attempt >= maxRetries) {
          logger.error(`ZhipuAI request failed after ${maxRetries} attempts`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'ZhipuAI');
          throw error;
        }
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('ZhipuAI API failed after retries');
  }

  // ROADMAP GENERATION (unchanged)
  async generateRoadmap(session: BookSession, bookId: string): Promise<BookRoadmap> {
    logger.info('Starting roadmap generation', { 
      bookId,
      goal: session.goal,
      complexity: session.complexityLevel,
      targetAudience: session.targetAudience
    }, 'RoadmapGeneration');
    
    this.updateProgress(bookId, { status: 'generating_roadmap', progress: 5 });

    const maxAttempts = 2;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const prompt = this.buildRoadmapPrompt(session);
        
        logger.debug('Roadmap prompt built', {
          promptLength: prompt.length,
          attempt: attempt + 1
        }, 'RoadmapGeneration');

        const startTime = Date.now();
        const response = await this.generateWithAI(prompt, bookId);
        const duration = Date.now() - startTime;
        
        logger.debug('Roadmap response received', {
          responseLength: response.length,
          duration
        }, 'RoadmapGeneration');

        const roadmap = await this.parseRoadmapResponse(response, session);
        
        logger.info('Roadmap generation successful', {
          totalModules: roadmap.totalModules,
          estimatedTime: roadmap.estimatedReadingTime,
          difficulty: roadmap.difficultyLevel
        }, 'RoadmapGeneration');
        
        this.updateProgress(bookId, { status: 'roadmap_completed', progress: 10, roadmap });
        return roadmap;
      } catch (error) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        logger.error('Roadmap generation attempt failed', {
          attempt,
          maxAttempts,
          error: errorMessage
        }, 'RoadmapGeneration');

        if (attempt >= maxAttempts) {
          this.updateProgress(bookId, { status: 'error', error: `Roadmap generation failed: ${errorMessage}` });
          throw error;
        }
        
        logger.info('Retrying roadmap generation', { attempt: attempt + 1 }, 'RoadmapGeneration');
        await sleep(2000);
      }
    }
    throw new Error('Roadmap generation failed');
  }

  private buildRoadmapPrompt(session: BookSession): string {
    return `Create a comprehensive learning roadmap for: "${session.goal}"

Requirements:
- Generate 8-12 modules in a logical learning sequence
- Each module should have a clear title and 3-5 specific learning objectives
- Estimate realistic reading/study time for each module
- Target audience: ${session.targetAudience || 'general learners'}
- Complexity: ${session.complexityLevel || 'intermediate'}

Return ONLY valid JSON:
{
  "modules": [
    {
      "title": "Module Title",
      "objectives": ["Objective 1", "Objective 2"],
      "estimatedTime": "2-3 hours"
    }
  ],
  "estimatedReadingTime": "20-25 hours",
  "difficultyLevel": "intermediate"
}`;
  }

  private async parseRoadmapResponse(response: string, session: BookSession): Promise<BookRoadmap> {
    let cleanedResponse = response.trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^[^{]*/, '')
      .replace(/[^}]*$/, '');

    let jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format: No valid JSON found');
    }

    const roadmap = JSON.parse(jsonMatch[0]);

    if (!roadmap.modules || !Array.isArray(roadmap.modules)) {
      throw new Error('Invalid roadmap: missing modules array');
    }

    roadmap.modules = roadmap.modules.map((module: any, index: number) => ({
      id: `module_${index + 1}`,
      title: module.title?.trim() || `Module ${index + 1}`,
      objectives: Array.isArray(module.objectives) ? module.objectives : [`Learn ${module.title}`],
      estimatedTime: module.estimatedTime || '1-2 hours',
      order: index + 1
    }));

    roadmap.totalModules = roadmap.modules.length;
    roadmap.estimatedReadingTime = roadmap.estimatedReadingTime || `${roadmap.modules.length * 2} hours`;
    roadmap.difficultyLevel = roadmap.difficultyLevel || session.complexityLevel || 'intermediate';

    return roadmap;
  }

  // =======================================================
  // CRITICAL UPDATE: REVISED generateModuleContentWithRetry
  // =======================================================
  async generateModuleContentWithRetry(
    book: BookProject,
    roadmapModule: RoadmapModule,
    session: BookSession,
    attemptNumber: number = 1
  ): Promise<BookModule> {
    logger.info('Starting module generation', {
      bookId: book.id,
      moduleTitle: roadmapModule.title,
      attempt: attemptNumber,
      totalModules: book.roadmap?.totalModules
    }, 'ModuleGeneration');

    const totalWordsBefore = book.modules.reduce((sum, m) => sum + (m.status === 'completed' ? m.wordCount : 0), 0);

    // Clear previous text FIRST
    this.currentGeneratedTexts.set(book.id, '');

    this.updateGenerationStatus(book.id, {
      currentModule: {
        id: roadmapModule.id,
        title: roadmapModule.title,
        attempt: attemptNumber,
        progress: 0,
        generatedText: ''
      },
      totalProgress: 0,
      status: 'generating',
      logMessage: `Starting: ${roadmapModule.title} (Attempt ${attemptNumber}/${this.MAX_MODULE_RETRIES})`,
      totalWordsGenerated: totalWordsBefore,
      aiStage: 'analyzing'
    });

    try {
      const previousModules = book.modules.filter(m => m.status === 'completed');
      const isFirstModule = previousModules.length === 0;
      const moduleIndex = roadmapModule.order;
      const totalModules = book.roadmap?.totalModules || 0;

      const prompt = this.buildModulePrompt(session, roadmapModule, previousModules, isFirstModule, moduleIndex, totalModules);
      
      logger.debug('Built module prompt', {
        promptLength: prompt.length,
        moduleIndex,
        isFirstModule
      }, 'ModuleGeneration');

      const generationStartTime = Date.now();
      
      // REAL-TIME STREAMING with word count updates
      const moduleContent = await this.generateWithAI(prompt, book.id, (chunk) => {
        const currentText = (this.currentGeneratedTexts.get(book.id) || '') + chunk;
        this.currentGeneratedTexts.set(book.id, currentText);
        
        // Calculate REAL-TIME word count
        const currentWordCount = currentText.split(/\s+/).filter(w => w.length > 0).length;
        
        // Estimate progress (3000 words target)
        const estimatedWordTarget = 3000;
        const progress = Math.min(95, (currentWordCount / estimatedWordTarget) * 100);
        
        // Determine AI stage based on word count
        let aiStage: GenerationStatus['aiStage'] = 'analyzing';
        if (currentWordCount >= estimatedWordTarget * 0.9) aiStage = 'polishing';
        else if (currentWordCount >= estimatedWordTarget * 0.6) aiStage = 'examples';
        else if (currentWordCount >= estimatedWordTarget * 0.15) aiStage = 'writing';
        
        // Update status in real-time
        this.updateGenerationStatus(book.id, {
          currentModule: {
            id: roadmapModule.id,
            title: roadmapModule.title,
            attempt: attemptNumber,
            progress,
            generatedText: currentText.slice(-800) // Show last 800 chars for performance
          },
          totalProgress: 0,
          status: 'generating',
          totalWordsGenerated: totalWordsBefore + currentWordCount, // REAL-TIME UPDATE
          aiStage
        });
      });

      const generationDuration = Date.now() - generationStartTime;
      
      const wordCount = moduleContent.split(/\s+/).filter(word => word.length > 0).length;

      if (wordCount < 300) {
        logger.warn(`Generated content too short for ${roadmapModule.title}`, {
          wordCount,
          minimumRequired: 300
        }, 'ModuleGeneration');
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

      logger.info('Module generation successful', {
        moduleId: module.id,
        moduleTitle: module.title,
        wordCount: module.wordCount,
        duration: generationDuration,
        attempt: attemptNumber
      }, 'ModuleGeneration');

      // Clear generated text on completion
      this.currentGeneratedTexts.delete(book.id);

      this.updateGenerationStatus(book.id, {
        currentModule: {
          id: roadmapModule.id,
          title: roadmapModule.title,
          attempt: attemptNumber,
          progress: 100
          // No generatedText = hide streaming box
        },
        totalProgress: 0,
        status: 'generating',
        logMessage: `✓ Completed: ${roadmapModule.title} (${wordCount} words in ${Math.round(generationDuration / 1000)}s)`,
        totalWordsGenerated: totalWordsBefore + wordCount,
        aiStage: 'complete'
      });

      return module;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Module generation failed', {
        moduleTitle: roadmapModule.title,
        attempt: attemptNumber,
        error: errorMessage,
      }, 'ModuleGeneration');

      if (this.shouldRetry(error, attemptNumber)) {
        const isRateLimit = this.isRateLimitError(error);
        const delay = this.calculateRetryDelay(attemptNumber, isRateLimit);
        
        logger.warn(`Retrying module generation after ${Math.round(delay / 1000)}s`, {
          module: roadmapModule.title,
          attempt: attemptNumber + 1,
          maxAttempts: this.MAX_MODULE_RETRIES
        }, 'ModuleGeneration');
        
        this.updateGenerationStatus(book.id, {
          currentModule: {
            id: roadmapModule.id,
            title: roadmapModule.title,
            attempt: attemptNumber,
            progress: 0
          },
          totalProgress: 0,
          status: 'generating',
          logMessage: `⚠️ Retry in ${Math.round(delay / 1000)}s: ${roadmapModule.title}`
        });
        
        await sleep(delay);
        return this.generateModuleContentWithRetry(book, roadmapModule, session, attemptNumber + 1);
      }

      this.updateGenerationStatus(book.id, {
          status: 'error',
          logMessage: `✗ Failed: ${roadmapModule.title} after all retries.`
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

  private buildModulePrompt(
    session: BookSession,
    roadmapModule: RoadmapModule,
    previousModules: BookModule[],
    isFirstModule: boolean,
    moduleIndex: number,
    totalModules: number
  ): string {
    const contextSummary = !isFirstModule && previousModules.length > 0 ?
      `\n\nPREVIOUS MODULES CONTEXT:\n${previousModules.slice(-2).map(m =>
        `${m.title}: ${m.content.substring(0, 300)}...`
      ).join('\n\n')}` : '';

    return `Generate a comprehensive chapter for: "${roadmapModule.title}"

CONTEXT:
- Learning Goal: ${session.goal}
- Module ${moduleIndex} of ${totalModules}
- Objectives: ${roadmapModule.objectives.join(', ')}
- Target Audience: ${session.targetAudience || 'general learners'}
- Complexity: ${session.complexityLevel || 'intermediate'}${contextSummary}

REQUIREMENTS:
- Write 2000-4000 words
- ${isFirstModule ? 'Provide introduction' : 'Build upon previous content'}
- Use ## markdown headers
- Include bullet points and lists
${session.preferences?.includeExamples ? '- Include practical examples' : ''}
${session.preferences?.includePracticalExercises ? '- Add exercises at the end' : ''}

STRUCTURE:
## ${roadmapModule.title}
### Introduction
### Core Concepts
### Practical Application
${session.preferences?.includePracticalExercises ? '### Practice Exercises' : ''}
### Key Takeaways`;
  }

  // BULK MODULE GENERATION WITH RECOVERY (unchanged - uses the streaming generateModuleContentWithRetry)
  async generateAllModulesWithRecovery(book: BookProject, session: BookSession): Promise<void> {
    if (!book.roadmap) {
      throw new Error('No roadmap available for module generation');
    }

    logger.info('Starting bulk module generation with recovery', { 
      bookId: book.id,
      totalModules: book.roadmap.modules.length,
      hasCheckpoint: this.hasCheckpoint(book.id)
    }, 'BulkGeneration');
    
    this.updateProgress(book.id, { status: 'generating_content', progress: 15 });

    const checkpoint = this.loadCheckpoint(book.id);
    const completedModules = [...book.modules.filter(m => m.status === 'completed')];
    const completedModuleIds = new Set(
      checkpoint?.completedModuleIds || completedModules.map(m => m.roadmapModuleId)
    );
    const failedModuleIds = new Set<string>(checkpoint?.failedModuleIds || []);

    const modulesToGenerate = book.roadmap.modules.filter(
      roadmapModule => !completedModuleIds.has(roadmapModule.id)
    );

    logger.info('Module generation plan', {
      total: book.roadmap.modules.length,
      alreadyCompleted: completedModuleIds.size,
      remaining: modulesToGenerate.length,
      previouslyFailed: failedModuleIds.size
    }, 'BulkGeneration');

    if (modulesToGenerate.length === 0) {
      logger.info('All modules already completed, skipping generation', {}, 'BulkGeneration');
      this.updateProgress(book.id, { status: 'roadmap_completed', progress: 90 });
      return;
    }

    const batchStartTime = Date.now();

    for (let i = 0; i < modulesToGenerate.length; i++) {
      const roadmapModule = modulesToGenerate[i];
      
      logger.info(`Processing module ${i + 1}/${modulesToGenerate.length}`, {
        moduleId: roadmapModule.id,
        moduleTitle: roadmapModule.title,
        order: roadmapModule.order
      }, 'BulkGeneration');

      // Clear previous generated text
      this.clearCurrentGeneratedText(book.id);

      try {
        const newModule = await this.generateModuleContentWithRetry(
          { ...book, modules: completedModules },
          roadmapModule,
          session
        );

        if (newModule.status === 'completed') {
          completedModules.push(newModule);
          completedModuleIds.add(roadmapModule.id);
          failedModuleIds.delete(roadmapModule.id);
          
          this.saveCheckpoint(
            book.id,
            Array.from(completedModuleIds),
            Array.from(failedModuleIds),
            i
          );

          const progress = 15 + ((completedModules.length / book.roadmap.modules.length) * 70);
          
          this.updateProgress(book.id, {
            modules: [...completedModules],
            progress: Math.min(85, progress)
          });

          logger.info('Module checkpoint saved', {
            moduleTitle: roadmapModule.title,
            completedCount: completedModules.length,
            totalCount: book.roadmap.modules.length,
            progress: Math.round(progress)
          }, 'BulkGeneration');
        } else {
          failedModuleIds.add(roadmapModule.id);
          
          this.saveCheckpoint(
            book.id,
            Array.from(completedModuleIds),
            Array.from(failedModuleIds),
            i
          );

          logger.warn('Module marked as failed in checkpoint', {
            moduleTitle: roadmapModule.title,
            error: newModule.error
          }, 'BulkGeneration');

          completedModules.push(newModule);
          this.updateProgress(book.id, { modules: [...completedModules] });
        }

        if (i < modulesToGenerate.length - 1) {
          await sleep(1000);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Unexpected error during module generation', {
          moduleTitle: roadmapModule.title,
          error: errorMessage
        }, 'BulkGeneration');

        failedModuleIds.add(roadmapModule.id);
        this.saveCheckpoint(
          book.id,
          Array.from(completedModuleIds),
          Array.from(failedModuleIds),
          i
        );

        completedModules.push({
          id: generateId(),
          roadmapModuleId: roadmapModule.id,
          title: roadmapModule.title,
          content: '',
          wordCount: 0,
          status: 'error',
          error: errorMessage,
          generatedAt: new Date()
        });

        this.updateProgress(book.id, { modules: [...completedModules] });
      }
    }

    const batchDuration = Date.now() - batchStartTime;
    const hasFailures = completedModules.some(m => m.status === 'error');

    if (hasFailures) {
      const failedCount = completedModules.filter(m => m.status === 'error').length;
      const successCount = completedModules.filter(m => m.status === 'completed').length;
      
      logger.warn('Bulk generation completed with failures', {
        totalModules: book.roadmap.modules.length,
        successful: successCount,
        failed: failedCount,
        duration: batchDuration,
        averageTimePerModule: Math.round(batchDuration / modulesToGenerate.length)
      }, 'BulkGeneration');

      this.updateProgress(book.id, {
        status: 'error',
        error: `Generation completed with ${failedCount} failed module(s). Successfully generated ${successCount} modules. You can retry failed modules or continue to assembly.`,
        modules: completedModules
      });
    } else {
      logger.info('Bulk generation completed successfully', {
        totalModules: book.roadmap.modules.length,
        totalDuration: batchDuration,
        averageTimePerModule: Math.round(batchDuration / modulesToGenerate.length)
      }, 'BulkGeneration');
      
      this.clearCheckpoint(book.id);
      this.updateProgress(book.id, {
        status: 'roadmap_completed',
        modules: completedModules,
        progress: 90
      });
    }
  }

  // RETRY FAILED MODULES (unchanged - uses streaming)
  async retryFailedModules(book: BookProject, session: BookSession): Promise<void> {
    if (!book.roadmap) {
      throw new Error('No roadmap available');
    }

    const failedModules = book.modules.filter(m => m.status === 'error');
    
    if (failedModules.length === 0) {
      logger.info('No failed modules to retry', {}, 'RetryFailedModules');
      return;
    }

    logger.info('Retrying failed modules', { count: failedModules.length }, 'RetryFailedModules');
    
    const completedModules = book.modules.filter(m => m.status === 'completed');
    const updatedModules = [...completedModules];

    for (const failedModule of failedModules) {
      const roadmapModule = book.roadmap.modules.find(
        rm => rm.id === failedModule.roadmapModuleId
      );

      if (!roadmapModule) {
        logger.warn('Roadmap module not found for failed module', {
          failedModuleId: failedModule.id
        }, 'RetryFailedModules');
        continue;
      }

      try {
        const newModule = await this.generateModuleContentWithRetry(
          { ...book, modules: updatedModules },
          roadmapModule,
          session
        );

        if (newModule.status === 'completed') {
          updatedModules.push(newModule);
          logger.info('Failed module successfully regenerated', {
            title: roadmapModule.title
          }, 'RetryFailedModules');
        } else {
          updatedModules.push(newModule);
          logger.warn('Module still failed after retry', {
            title: roadmapModule.title
          }, 'RetryFailedModules');
        }

        this.updateProgress(book.id, { modules: [...updatedModules] });
        await sleep(1000);

      } catch (error) {
        logger.error('Error retrying failed module', {
          module: roadmapModule.title,
          error
        }, 'RetryFailedModules');
      }
    }

    const stillFailed = updatedModules.filter(m => m.status === 'error').length;
    
    if (stillFailed === 0) {
      this.clearCheckpoint(book.id);
      this.updateProgress(book.id, {
        status: 'roadmap_completed',
        modules: updatedModules,
        progress: 90
      });
    } else {
      this.updateProgress(book.id, {
        status: 'error',
        error: `${stillFailed} module(s) still failed after retry`,
        modules: updatedModules
      });
    }
  }

  // ASSEMBLE FINAL BOOK (unchanged - doesn't need streaming for intro/summary)
  async assembleFinalBook(book: BookProject, session: BookSession): Promise<void> {
    logger.info('Starting book assembly', { bookId: book.id }, 'BookAssembly');
    this.updateProgress(book.id, { status: 'assembling', progress: 90 });

    try {
      const [introduction, summary, glossary] = await Promise.all([
        this.generateBookIntroduction(session, book.roadmap!),
        this.generateBookSummary(session, book.modules),
        this.generateGlossary(book.modules)
      ]);

      const totalWords = book.modules.reduce((sum, m) => sum + m.wordCount, 0);
      const providerName = this.getProviderDisplayName();
      const modelName = this.settings.selectedModel;

      const finalBook = [
        `# ${book.title}\n`,
        `**Generated:** ${new Date().toLocaleDateString()}\n`,
        `**Words:** ${totalWords.toLocaleString()}\n`,
        `**Provider:** ${providerName} (${modelName})\n\n`,
        `---\n\n## Table of Contents\n`,
        this.generateTableOfContents(book.modules),
        `\n\n---\n\n## Introduction\n\n${introduction}\n\n---\n\n`,
        ...book.modules.map((m, i) => 
          `${m.content}\n\n${i < book.modules.length - 1 ? '---\n\n' : ''}`
        ),
        `\n---\n\n## Summary\n\n${summary}\n\n---\n\n`,
        `## Glossary\n\n${glossary}`
      ].join('');

      logger.info('Book assembly completed', {
        totalWords,
        totalModules: book.modules.length
      }, 'BookAssembly');

      this.clearCheckpoint(book.id);
      this.updateProgress(book.id, {
        status: 'completed',
        progress: 100,
        finalBook,
        totalWords
      });
    } catch (error) {
      logger.error('Book assembly failed', { error }, 'BookAssembly');
      throw error;
    }
  }

  private getProviderDisplayName(): string {
    const names: Record<string, string> = { 
      google: 'Google Gemini', 
      mistral: 'Mistral AI', 
      zhipu: 'ZhipuAI' 
    };
    return names[this.settings.selectedProvider] || 'AI';
  }

  private generateTableOfContents(modules: BookModule[]): string {
    return modules.map((m, i) => 
      `${i + 1}. [${m.title}](#${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`
    ).join('\n');
  }

  private async generateBookIntroduction(session: BookSession, roadmap: BookRoadmap): Promise<string> {
    const prompt = `Generate a compelling introduction for: "${session.goal}"

ROADMAP:
${roadmap.modules.map(m => `- ${m.title}`).join('\n')}

TARGET: ${session.targetAudience || 'general learners'}
LEVEL: ${roadmap.difficultyLevel}

Write 800-1200 words covering:
- Welcome and book purpose
- What readers will learn
- Book structure overview
- Motivation and expectations
Use engaging tone with ## markdown headers.`;

    return await this.generateWithAI(prompt);
  }

  private async generateBookSummary(session: BookSession, modules: BookModule[]): Promise<string> {
    const prompt = `Generate summary for: "${session.goal}"

MODULES:
${modules.map(m => `- ${m.title}`).join('\n')}

Write 600-900 words covering:
- Key learning outcomes
- Important concepts recap
- Next steps guidance
- Congratulations to reader`;

    return await this.generateWithAI(prompt);
  }

  private async generateGlossary(modules: BookModule[]): Promise<string> {
    const content = modules.map(m => m.content).join('\n\n').substring(0, 12000);
    
    const prompt = `Extract key terms from this content and create a glossary:
${content}

Create 20-30 terms with:
- Clear 1-2 sentence definitions
- Alphabetical order
- Focus on technical/important terms

Format:
**Term**: Definition.
**Term 2**: Definition.`;

    return await this.generateWithAI(prompt);
  }

  downloadAsMarkdown(project: BookProject): void {
    if (!project.finalBook) {
      throw new Error('No book content available for download');
    }

    const blob = new Blob([project.finalBook], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = project.title.replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '_').toLowerCase().substring(0, 50);
    const filename = `${safeTitle}_${new Date().toISOString().slice(0, 10)}_book.md`;

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
}

export const bookService = new BookGenerationService();
