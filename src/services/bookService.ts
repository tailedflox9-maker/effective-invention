// src/services/bookService.ts - Enhanced Version with Recovery
import { BookProject, BookRoadmap, BookModule, RoadmapModule, BookSession } from '../types/book';
import { APISettings, ModelProvider } from '../types';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Checkpoint storage for recovery
interface GenerationCheckpoint {
  bookId: string;
  completedModuleIds: string[];
  failedModuleIds: string[];
  lastSuccessfulIndex: number;
  timestamp: Date;
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
  private requestTimeout = 120000;
  private activeRequests = new Map<string, AbortController>();
  private checkpoints = new Map<string, GenerationCheckpoint>();
  
  // Enhanced retry configuration
  private readonly MAX_MODULE_RETRIES = 3;
  private readonly RETRY_DELAY_BASE = 2000; // 2 seconds base delay

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

  private updateProgress(bookId: string, updates: Partial<BookProject>) {
    logger.info(`Book ${bookId} progress update`, { status: updates.status, progress: updates.progress });
    if (this.onProgressUpdate) {
      this.onProgressUpdate(bookId, { ...updates, updatedAt: new Date() });
    }
  }

  // Save checkpoint for recovery
  private saveCheckpoint(bookId: string, completedModuleIds: string[], failedModuleIds: string[], lastIndex: number) {
    const checkpoint: GenerationCheckpoint = {
      bookId,
      completedModuleIds,
      failedModuleIds,
      lastSuccessfulIndex: lastIndex,
      timestamp: new Date()
    };
    this.checkpoints.set(bookId, checkpoint);
    
    // Also save to localStorage for persistence across page refreshes
    try {
      localStorage.setItem(`checkpoint_${bookId}`, JSON.stringify(checkpoint));
      logger.debug('Checkpoint saved', { bookId, completedCount: completedModuleIds.length });
    } catch (error) {
      logger.warn('Failed to save checkpoint to localStorage', error);
    }
  }

  // Load checkpoint for recovery
  private loadCheckpoint(bookId: string): GenerationCheckpoint | null {
    // Try memory first
    if (this.checkpoints.has(bookId)) {
      return this.checkpoints.get(bookId)!;
    }
    
    // Try localStorage
    try {
      const stored = localStorage.getItem(`checkpoint_${bookId}`);
      if (stored) {
        const checkpoint = JSON.parse(stored);
        checkpoint.timestamp = new Date(checkpoint.timestamp);
        return checkpoint;
      }
    } catch (error) {
      logger.warn('Failed to load checkpoint from localStorage', error);
    }
    
    return null;
  }

  // Clear checkpoint after successful completion
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

  // Core API methods (same as before)
  private async generateWithGoogle(prompt: string, signal?: AbortSignal): Promise<string> {
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
          throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Invalid response from Google API');
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

  private async generateWithMistral(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
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

        if (response.status === 429) {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || `Mistral API Error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Invalid response from Mistral API');
        return text;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        attempt++;
        if (attempt >= maxRetries) throw error;
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('Mistral API failed after retries');
  }

  private async generateWithZhipu(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
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

        if (response.status === 429 || response.status === 503) {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || `ZhipuAI API Error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Invalid response from ZhipuAI API');
        return text;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        attempt++;
        if (attempt >= maxRetries) throw error;
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('ZhipuAI API failed after retries');
  }

  private async generateWithAI(prompt: string, bookId?: string): Promise<string> {
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
        case 'google': result = await this.generateWithGoogle(prompt, abortController.signal); break;
        case 'mistral': result = await this.generateWithMistral(prompt, abortController.signal); break;
        case 'zhipu': result = await this.generateWithZhipu(prompt, abortController.signal); break;
        default: throw new Error(`Unsupported provider: ${this.settings.selectedProvider}`);
      }
      return result;
    } finally {
      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);
    }
  }

  // Enhanced roadmap generation with retry
  async generateRoadmap(session: BookSession, bookId: string): Promise<BookRoadmap> {
    logger.info('Starting roadmap generation', { bookId });
    this.updateProgress(bookId, { status: 'generating_roadmap', progress: 5 });

    const maxAttempts = 2;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const prompt = this.buildRoadmapPrompt(session);
        const response = await this.generateWithAI(prompt, bookId);
        const roadmap = await this.parseRoadmapResponse(response, session);
        
        this.updateProgress(bookId, { status: 'roadmap_completed', progress: 10, roadmap });
        return roadmap;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.updateProgress(bookId, { status: 'error', error: `Roadmap generation failed: ${errorMessage}` });
          throw error;
        }
        logger.warn(`Roadmap attempt ${attempt} failed, retrying...`, { bookId });
        await sleep(2000);
      }
    }
    throw new Error('Roadmap generation failed');
  }

  // ENHANCED: Module generation with individual retry and checkpoint
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

    try {
      const previousModules = book.modules.filter(m => m.status === 'completed');
      const isFirstModule = previousModules.length === 0;
      const moduleIndex = roadmapModule.order;
      const totalModules = book.roadmap?.totalModules || 0;

      const prompt = this.buildModulePrompt(session, roadmapModule, previousModules, isFirstModule, moduleIndex, totalModules);
      const moduleContent = await this.generateWithAI(prompt, book.id);
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

      logger.info('Module generation successful', {
        moduleId: module.id,
        wordCount: module.wordCount
      });

      return module;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (attemptNumber < this.MAX_MODULE_RETRIES) {
        // Calculate exponential backoff delay
        const delay = this.RETRY_DELAY_BASE * Math.pow(2, attemptNumber - 1);
        logger.warn(`Module generation attempt ${attemptNumber} failed, retrying in ${delay}ms`, {
          module: roadmapModule.title,
          error: errorMessage
        });
        
        // Wait before retry
        await sleep(delay);
        
        // Recursive retry
        return this.generateModuleContentWithRetry(book, roadmapModule, session, attemptNumber + 1);
      }

      // All retries exhausted
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

  // ENHANCED: Generate all modules with checkpoint recovery
  async generateAllModulesWithRecovery(book: BookProject, session: BookSession): Promise<void> {
    if (!book.roadmap) {
      throw new Error('No roadmap available for module generation');
    }

    logger.info('Starting module generation with recovery support', { bookId: book.id });
    this.updateProgress(book.id, { status: 'generating_content', progress: 15 });

    // Check for existing checkpoint
    const checkpoint = this.loadCheckpoint(book.id);
    const completedModules = [...book.modules.filter(m => m.status === 'completed')];
    const completedModuleIds = new Set(
      checkpoint?.completedModuleIds || completedModules.map(m => m.roadmapModuleId)
    );
    const failedModuleIds = new Set<string>(checkpoint?.failedModuleIds || []);

    // Determine which modules need generation
    const modulesToGenerate = book.roadmap.modules.filter(
      roadmapModule => !completedModuleIds.has(roadmapModule.id)
    );

    logger.info('Module generation plan', {
      total: book.roadmap.modules.length,
      completed: completedModuleIds.size,
      remaining: modulesToGenerate.length,
      failed: failedModuleIds.size
    });

    if (modulesToGenerate.length === 0) {
      logger.info('All modules already completed');
      this.updateProgress(book.id, { status: 'roadmap_completed', progress: 90 });
      return;
    }

    // Generate remaining modules
    for (let i = 0; i < modulesToGenerate.length; i++) {
      const roadmapModule = modulesToGenerate[i];
      
      logger.info(`Generating module ${i + 1}/${modulesToGenerate.length}`, {
        title: roadmapModule.title
      });

      try {
        // Generate with retry logic
        const newModule = await this.generateModuleContentWithRetry(
          { ...book, modules: completedModules },
          roadmapModule,
          session
        );

        if (newModule.status === 'completed') {
          completedModules.push(newModule);
          completedModuleIds.add(roadmapModule.id);
          failedModuleIds.delete(roadmapModule.id);
          
          // Save checkpoint after each successful module
          this.saveCheckpoint(
            book.id,
            Array.from(completedModuleIds),
            Array.from(failedModuleIds),
            i
          );

          // Calculate progress (15% to 85% range for modules)
          const progress = 15 + ((completedModules.length / book.roadmap.modules.length) * 70);
          
          this.updateProgress(book.id, {
            modules: [...completedModules],
            progress: Math.min(85, progress)
          });

          logger.info('Module completed and checkpoint saved', {
            module: roadmapModule.title,
            totalCompleted: completedModules.length
          });
        } else {
          // Module failed after all retries
          failedModuleIds.add(roadmapModule.id);
          
          // Save checkpoint with failed module
          this.saveCheckpoint(
            book.id,
            Array.from(completedModuleIds),
            Array.from(failedModuleIds),
            i
          );

          logger.warn('Module marked as failed', {
            module: roadmapModule.title,
            error: newModule.error
          });

          // Add failed module to list for user visibility
          completedModules.push(newModule);
          this.updateProgress(book.id, { modules: [...completedModules] });
        }

        // Small delay between modules to avoid rate limiting
        if (i < modulesToGenerate.length - 1) {
          await sleep(1000);
        }

      } catch (error) {
        // Unexpected error during module generation
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Unexpected error during module generation', {
          module: roadmapModule.title,
          error: errorMessage
        });

        failedModuleIds.add(roadmapModule.id);
        this.saveCheckpoint(
          book.id,
          Array.from(completedModuleIds),
          Array.from(failedModuleIds),
          i
        );

        // Add failed module
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

    // Check if we have any failed modules
    const hasFailures = completedModules.some(m => m.status === 'error');

    if (hasFailures) {
      const failedCount = completedModules.filter(m => m.status === 'error').length;
      const successCount = completedModules.filter(m => m.status === 'completed').length;
      
      logger.warn('Module generation completed with failures', {
        total: book.roadmap.modules.length,
        successful: successCount,
        failed: failedCount
      });

      this.updateProgress(book.id, {
        status: 'error',
        error: `Generation completed with ${failedCount} failed module(s). Successfully generated ${successCount} modules. You can retry failed modules or continue to assembly.`,
        modules: completedModules
      });
    } else {
      // All modules successful
      logger.info('All modules generated successfully');
      this.clearCheckpoint(book.id);
      this.updateProgress(book.id, {
        status: 'roadmap_completed',
        modules: completedModules,
        progress: 90
      });
    }
  }

  // ENHANCED: Retry only failed modules
  async retryFailedModules(book: BookProject, session: BookSession): Promise<void> {
    if (!book.roadmap) {
      throw new Error('No roadmap available');
    }

    const failedModules = book.modules.filter(m => m.status === 'error');
    
    if (failedModules.length === 0) {
      logger.info('No failed modules to retry');
      return;
    }

    logger.info('Retrying failed modules', { count: failedModules.length });
    
    const completedModules = book.modules.filter(m => m.status === 'completed');
    const updatedModules = [...completedModules];

    for (const failedModule of failedModules) {
      const roadmapModule = book.roadmap.modules.find(
        rm => rm.id === failedModule.roadmapModuleId
      );

      if (!roadmapModule) {
        logger.warn('Roadmap module not found for failed module', {
          failedModuleId: failedModule.id
        });
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
          });
        } else {
          updatedModules.push(newModule);
          logger.warn('Module still failed after retry', {
            title: roadmapModule.title
          });
        }

        this.updateProgress(book.id, { modules: [...updatedModules] });
        await sleep(1000);

      } catch (error) {
        logger.error('Error retrying failed module', {
          module: roadmapModule.title,
          error
        });
      }
    }

    // Check final status
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

  // Helper methods (same as before)
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

  // Assembly method (same as before, just reference it)
  async assembleFinalBook(book: BookProject, session: BookSession): Promise<void> {
    logger.info('Starting book assembly', { bookId: book.id });
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

      this.clearCheckpoint(book.id);
      this.updateProgress(book.id, {
        status: 'completed',
        progress: 100,
        finalBook,
        totalWords
      });
    } catch (error) {
      logger.error('Book assembly failed', { error });
      throw error;
    }
  }

  private getProviderDisplayName(): string {
    const names = { google: 'Google Gemini', mistral: 'Mistral AI', zhipu: 'ZhipuAI' };
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

  // New method to check if book has checkpoint
  hasCheckpoint(bookId: string): boolean {
    return this.checkpoints.has(bookId) || localStorage.getItem(`checkpoint_${bookId}`) !== null;
  }

  // New method to get checkpoint info
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
