// src/services/bookService.ts
import { BookProject, BookRoadmap, BookModule, RoadmapModule, BookSession } from '../types/book';
import { APISettings, ModelProvider } from '../types';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

// Helper function for delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class BookGenerationService {
  private settings: APISettings = {
    googleApiKey: '',
    zhipuApiKey: '',
    mistralApiKey: '',
    selectedProvider: 'google',
    selectedModel: 'gemini-2.5-flash'
  };

  private onProgressUpdate?: (bookId: string, updates: Partial<BookProject>) => void;

  // Enhanced properties for better request management
  private requestTimeout = 120000; // 2 minutes default timeout
  private activeRequests = new Map<string, AbortController>();
  private tokenUsage = {
    totalTokens: 0,
    requestCount: 0,
    lastReset: Date.now()
  };

  updateSettings(settings: APISettings) {
    this.settings = settings;
    logger.info('BookService settings updated', {
      provider: settings.selectedProvider,
      model: settings.selectedModel,
      hasGoogleKey: !!settings.googleApiKey,
      hasMistralKey: !!settings.mistralApiKey,
      hasZhipuKey: !!settings.zhipuApiKey
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

  // Enhanced settings validation
  validateSettings(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.settings.selectedProvider) {
      errors.push('No AI provider selected');
    }

    if (!this.settings.selectedModel) {
      errors.push('No model selected');
    }

    const apiKey = this.getApiKeyForProvider(this.settings.selectedProvider);
    if (!apiKey) {
      errors.push(`No API key configured for ${this.settings.selectedProvider}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Improved API key getter with better error handling
  private getApiKeyForProvider(provider: string): string | null {
    switch (provider) {
      case 'google': return this.settings.googleApiKey || null;
      case 'mistral': return this.settings.mistralApiKey || null;
      case 'zhipu': return this.settings.zhipuApiKey || null;
      default: return null;
    }
  }

  private getApiKey(): string {
    switch (this.settings.selectedProvider) {
      case 'google':
        if (!this.settings.googleApiKey) {
          const error = 'Google API key not configured. Please add your Google AI API key in Settings.';
          logger.error(error);
          throw new Error(error);
        }
        return this.settings.googleApiKey;

      case 'mistral':
        if (!this.settings.mistralApiKey) {
          const error = 'Mistral API key not configured. Please add your Mistral AI API key in Settings.';
          logger.error(error);
          throw new Error(error);
        }
        return this.settings.mistralApiKey;

      case 'zhipu':
        if (!this.settings.zhipuApiKey) {
          const error = 'ZhipuAI API key not configured. Please add your ZhipuAI API key in Settings.';
          logger.error(error);
          throw new Error(error);
        }
        return this.settings.zhipuApiKey;

      default:
        const error = `Unsupported provider: ${this.settings.selectedProvider}`;
        logger.error(error);
        throw new Error(error);
    }
  }

  private async generateWithGoogle(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;

    logger.info('Starting Google API request', { model, promptLength: prompt.length });

    const googleModels = ['gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.5-pro'];
    if (!googleModels.includes(model)) {
      const error = `Invalid Google model selected: ${model}`;
      logger.error(error);
      throw new Error(error);
    }

    const maxRetries = 3;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        logger.debug(`Google API attempt ${attempt + 1}/${maxRetries}`);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,
              }
            }),
            signal
          }
        );

        if (response.status === 429 || response.status === 503) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`Google API overloaded (${response.status}). Retrying in ${Math.round(delay / 1000)}s...`);
          lastError = new Error('The Google model is overloaded. Please try again later.');
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          let errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
          if (errorMessage.includes('API_KEY_INVALID')) {
            errorMessage = 'Invalid Google API key. Please check your API key in Settings.';
          }
          logger.error('Google API error', { status: response.status, errorMessage });
          throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data || !data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
          logger.error('Invalid Google API response - no candidates', data);
          throw new Error('Invalid response structure from Google API - no candidates');
        }

        const candidate = data.candidates[0];
        if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
          if (candidate.finishReason === 'SAFETY') {
            const error = 'Content was blocked by safety filters. Please try rephrasing your request.';
            logger.warn('Google API safety filter triggered');
            throw new Error(error);
          }
          logger.error('Invalid Google API response - no content parts', candidate);
          throw new Error('Invalid response from Google API - no content parts');
        }

        const text = candidate.content.parts[0].text;
        if (!text || typeof text !== 'string') {
          logger.error('Invalid Google API response - no text content');
          throw new Error('Invalid response from Google API - no text content');
        }

        logger.info('Google API request successful', { responseLength: text.length });
        return text;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        lastError = error as Error;
        if (error instanceof TypeError && error.message.includes('fetch')) {
          const networkError = 'Network error. Please check your internet connection and try again.';
          logger.error('Network error during Google API request', error);
          throw new Error(networkError);
        }
        attempt++;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`Google API attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s`, error);
          await sleep(delay);
        }
      }
    }

    logger.error('Google API failed after all retries', lastError);
    throw lastError || new Error('Google API failed after multiple retries.');
  }

  private async generateWithMistral(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;

    logger.info('Starting Mistral API request', { model, promptLength: prompt.length });

    const mistralModels = ['open-mistral-7b', 'open-mixtral-8x7b', 'mistral-small-latest', 'mistral-large-latest'];
    if (!mistralModels.includes(model)) {
      const error = `Invalid Mistral model selected: ${model}`;
      logger.error(error);
      throw new Error(error);
    }

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        logger.debug(`Mistral API attempt ${attempt + 1}/${maxRetries}`);

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
          }),
          signal
        });

        if (response.status === 429) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`Mistral API rate limited. Retrying in ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          let errorMessage = errorData?.error?.message || `Mistral API Error: ${response.status}`;
          if (errorMessage.includes('Unauthorized')) {
            errorMessage = 'Invalid Mistral API key. Please check your API key in Settings.';
          }
          logger.error('Mistral API error', { status: response.status, errorMessage });
          throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          logger.error('Invalid Mistral API response - no choices', data);
          throw new Error('Invalid response structure from Mistral API - no choices');
        }

        const choice = data.choices[0];
        if (!choice.message || !choice.message.content) {
          logger.error('Invalid Mistral API response - no message content', choice);
          throw new Error('Invalid response from Mistral API - no message content');
        }

        logger.info('Mistral API request successful', { responseLength: choice.message.content.length });
        return choice.message.content;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        attempt++;
        if (attempt >= maxRetries) {
          logger.error('Mistral API failed after all retries', error);
          throw error;
        }
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`Mistral API attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s`, error);
        await sleep(delay);
      }
    }

    throw new Error('Mistral API failed after retries');
  }

  private async generateWithZhipu(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.settings.selectedModel;

    logger.info('Starting ZhipuAI API request', { model, promptLength: prompt.length });

    // Updated: Correct model ID
    const zhipuModels = ['glm-4.5-flash'];
    if (!zhipuModels.includes(model)) {
      const error = `Invalid ZhipuAI model selected: ${model}`;
      logger.error(error);
      throw new Error(error);
    }

    const maxRetries = 3;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        logger.debug(`ZhipuAI API attempt ${attempt + 1}/${maxRetries}`);

        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 8192,
            stream: false
          }),
          signal
        });

        if (response.status === 429 || response.status === 503) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`ZhipuAI API overloaded (${response.status}). Retrying in ${Math.round(delay / 1000)}s...`);
          lastError = new Error('The ZhipuAI model is overloaded. Please try again later.');
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          let errorMessage = errorData?.error?.message || `ZhipuAI API Error: ${response.status} - ${response.statusText}`;

          if (response.status === 401 || errorMessage.includes('Unauthorized') || errorMessage.includes('invalid_api_key')) {
            errorMessage = 'Invalid ZhipuAI API key. Please check your API key in Settings.';
          } else if (response.status === 400) {
            errorMessage = 'Bad request to ZhipuAI API. Please try a different prompt or model.';
          } else if (response.status === 500) {
            errorMessage = 'ZhipuAI server error. Please try again later.';
          }

          logger.error('ZhipuAI API error', { status: response.status, errorMessage, errorData });
          throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          logger.error('Invalid ZhipuAI API response - no choices', data);
          throw new Error('Invalid response structure from ZhipuAI API - no choices');
        }

        const choice = data.choices[0];
        if (!choice.message || !choice.message.content) {
          logger.error('Invalid ZhipuAI API response - no message content', choice);
          throw new Error('Invalid response from ZhipuAI API - no message content');
        }

        const text = choice.message.content;
        if (!text || typeof text !== 'string') {
          logger.error('Invalid ZhipuAI API response - invalid text content', { text });
          throw new Error('Invalid response from ZhipuAI API - no valid text content');
        }

        logger.info('ZhipuAI API request successful', { responseLength: text.length });
        return text;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        lastError = error as Error;

        if (error instanceof TypeError && error.message.includes('fetch')) {
          const networkError = 'Network error. Please check your internet connection and try again.';
          logger.error('Network error during ZhipuAI API request', error);
          throw new Error(networkError);
        }

        attempt++;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          logger.warn(`ZhipuAI API attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s`, error);
          await sleep(delay);
        }
      }
    }

    logger.error('ZhipuAI API failed after all retries', lastError);
    throw lastError || new Error('ZhipuAI API failed after multiple retries.');
  }

  // Enhanced generateWithAI with request management
  private async generateWithAI(prompt: string, bookId?: string): Promise<string> {
    // Pre-flight validation
    const validation = this.validateSettings();
    if (!validation.isValid) {
      const error = `Configuration error: ${validation.errors.join(', ')}`;
      logger.error(error);
      throw new Error(error);
    }

    if (!navigator.onLine) {
      const error = 'No internet connection. Please check your connection and try again.';
      logger.error(error);
      throw new Error(error);
    }

    // Create abort controller for this request
    const requestId = bookId || generateId();
    const abortController = new AbortController();
    this.activeRequests.set(requestId, abortController);

    // Set timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      this.activeRequests.delete(requestId);
    }, this.requestTimeout);

    try {
      logger.info('Starting AI generation', {
        provider: this.settings.selectedProvider,
        model: this.settings.selectedModel,
        requestId,
        promptLength: prompt.length
      });

      let result: string;
      const startTime = Date.now();

      switch (this.settings.selectedProvider) {
        case 'google':
          result = await this.generateWithGoogle(prompt, abortController.signal);
          break;
        case 'mistral':
          result = await this.generateWithMistral(prompt, abortController.signal);
          break;
        case 'zhipu':
          result = await this.generateWithZhipu(prompt, abortController.signal);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.settings.selectedProvider}`);
      }

      // Track usage
      const duration = Date.now() - startTime;
      this.tokenUsage.requestCount++;
      this.tokenUsage.totalTokens += this.estimateTokens(prompt + result);

      logger.info('AI generation completed', {
        provider: this.settings.selectedProvider,
        duration,
        responseLength: result.length,
        requestId
      });

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Request aborted due to timeout', { requestId });
        throw new Error('Request timed out. Please try again with a shorter prompt or check your connection.');
      }
      logger.error(`${this.settings.selectedProvider} API Error`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);
    }
  }

  // Simple token estimation
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  // Cancel active requests
  cancelActiveRequests(bookId?: string): void {
    if (bookId && this.activeRequests.has(bookId)) {
      this.activeRequests.get(bookId)?.abort();
      this.activeRequests.delete(bookId);
      logger.info('Cancelled request for book', { bookId });
    } else {
      // Cancel all active requests
      this.activeRequests.forEach((controller) => controller.abort());
      this.activeRequests.clear();
      logger.info('Cancelled all active requests');
    }
  }

  // Enhanced error recovery in roadmap generation
  async generateRoadmap(session: BookSession, bookId: string): Promise<BookRoadmap> {
    logger.info('Starting roadmap generation', { bookId, goal: session.goal });
    this.updateProgress(bookId, { status: 'generating_roadmap', progress: 5 });

    const maxAttempts = 2; // Allow one retry for roadmap
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const prompt = this.buildRoadmapPrompt(session);
        const response = await this.generateWithAI(prompt, bookId);
        const roadmap = await this.parseRoadmapResponse(response, session);

        logger.info('Roadmap generation completed successfully', {
          bookId,
          moduleCount: roadmap.modules.length,
          estimatedTime: roadmap.estimatedReadingTime
        });

        this.updateProgress(bookId, { status: 'roadmap_completed', progress: 10, roadmap });
        return roadmap;

      } catch (error) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (attempt >= maxAttempts) {
          logger.error('Roadmap generation failed after all attempts', { bookId, error });
          this.updateProgress(bookId, { status: 'error', error: `Roadmap generation failed: ${errorMessage}` });
          throw error;
        }

        logger.warn(`Roadmap generation attempt ${attempt} failed, retrying...`, { bookId, error: errorMessage });
        await sleep(2000); // Wait 2 seconds before retry
      }
    }

    throw new Error('Roadmap generation failed after all attempts');
  }

  // Extracted prompt building
  private buildRoadmapPrompt(session: BookSession): string {
    return `Create a comprehensive learning roadmap for: "${session.goal}"

    Requirements:
    - Generate 8-12 modules in a logical learning sequence
    - Each module should have a clear title and 3-5 specific learning objectives
    - Estimate realistic reading/study time for each module
    - Determine overall difficulty level (beginner/intermediate/advanced)
    - Target audience: ${session.targetAudience || 'general learners'}
    - Complexity: ${session.complexityLevel || 'intermediate'}

    CRITICAL: Return ONLY valid JSON, no markdown formatting, no extra text:

    {
      "modules": [
        {
          "title": "Module Title",
          "objectives": ["Objective 1", "Objective 2", "Objective 3"],
          "estimatedTime": "2-3 hours"
        }
      ],
      "estimatedReadingTime": "20-25 hours",
      "difficultyLevel": "intermediate"
    }`;
  }

  // Enhanced JSON parsing with better error messages
  private async parseRoadmapResponse(response: string, session: BookSession): Promise<BookRoadmap> {
    logger.debug('Parsing roadmap response', { responseLength: response.length });

    // Clean and extract JSON
    let cleanedResponse = response.trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^[^{]*/, '') // Remove everything before first {
      .replace(/[^}]*$/, ''); // Remove everything after last }

    let jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      logger.error('No valid JSON found in response', { response: response.substring(0, 500) });
      throw new Error('Invalid response format: No valid JSON object found. Please try again.');
    }

    try {
      const roadmap = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!roadmap.modules || !Array.isArray(roadmap.modules) || roadmap.modules.length === 0) {
        throw new Error('Invalid roadmap: missing or empty modules array');
      }

      if (roadmap.modules.length < 4 || roadmap.modules.length > 20) {
        logger.warn('Unusual number of modules', { count: roadmap.modules.length });
      }

      // Process and validate modules
      roadmap.modules = roadmap.modules.map((module: any, index: number) => {
        if (!module.title || typeof module.title !== 'string' || module.title.trim().length === 0) {
          throw new Error(`Module ${index + 1}: title is required and must be a non-empty string`);
        }

        return {
          id: `module_${index + 1}`,
          title: module.title.trim(),
          objectives: Array.isArray(module.objectives) && module.objectives.length > 0
            ? module.objectives
            : [`Learn ${module.title.trim()}`],
          estimatedTime: module.estimatedTime || '1-2 hours',
          order: index + 1
        };
      });

      // Set defaults
      roadmap.totalModules = roadmap.modules.length;
      roadmap.estimatedReadingTime = roadmap.estimatedReadingTime ||
        `${roadmap.modules.length * 2}-${roadmap.modules.length * 3} hours`;
      roadmap.difficultyLevel = roadmap.difficultyLevel || session.complexityLevel || 'intermediate';

      return roadmap;

    } catch (parseError) {
      logger.error('JSON parsing failed', { parseError, jsonString: jsonMatch[0].substring(0, 200) });
      throw new Error(`Failed to parse roadmap response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`);
    }
  }

  // Enhanced module generation with better context management
  async generateModuleContent(book: BookProject, roadmapModule: RoadmapModule, session: BookSession): Promise<BookModule> {
    logger.info('Starting module content generation', {
      bookId: book.id,
      moduleTitle: roadmapModule.title
    });

    const previousModules = book.modules.filter(m => m.status === 'completed');
    const isFirstModule = previousModules.length === 0;
    const moduleIndex = roadmapModule.order;
    const totalModules = book.roadmap?.totalModules || 0;

    // Build context-aware prompt
    const prompt = this.buildModulePrompt(session, roadmapModule, previousModules, isFirstModule, moduleIndex, totalModules);

    try {
      const moduleContent = await this.generateWithAI(prompt, book.id);

      // Validate content quality
      const wordCount = moduleContent.split(/\s+/).filter(word => word.length > 0).length;

      if (wordCount < 500) {
        logger.warn('Generated content seems short', { moduleTitle: roadmapModule.title, wordCount });
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

      logger.info('Module content generation completed', {
        moduleId: module.id,
        wordCount: module.wordCount,
        title: module.title
      });

      return module;

    } catch (error) {
      logger.error('Module generation failed', { moduleTitle: roadmapModule.title, error });

      // Create failed module for tracking
      const module: BookModule = {
        id: generateId(),
        roadmapModuleId: roadmapModule.id,
        title: roadmapModule.title,
        content: '',
        wordCount: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        generatedAt: new Date()
      };

      return module;
    }
  }

  // Better module prompt building
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

    BOOK CONTEXT:
    - Learning Goal: ${session.goal}
    - Module ${moduleIndex} of ${totalModules}
    - Module Objectives: ${roadmapModule.objectives.join(', ')}
    - Target Audience: ${session.targetAudience || 'general learners'}
    - Complexity Level: ${session.complexityLevel || 'intermediate'}${contextSummary}

    REQUIREMENTS:
    - Write a complete, detailed chapter (2000-4000 words)
    - ${isFirstModule ? 'This is the first chapter - provide a general introduction to set the stage' : 'Build upon previous modules naturally'}
    - Use clear, engaging language suitable for the target audience
    - Add section headers with ## markdown syntax
    - Use bullet points and numbered lists for readability
    ${session.preferences?.includeExamples ? '- Include practical examples and code snippets where relevant' : ''}
    ${session.preferences?.includePracticalExercises ? '- Add hands-on exercises at the end' : ''}

    STRUCTURE:
    ## ${roadmapModule.title}
    ### Introduction
    ${isFirstModule ? '(Set the stage for the entire book and introduce the topic)' : '(Connect to previous chapters and introduce this topic)'}
    ### Core Concepts
    (Thoroughly explain the main concepts with examples and analogies)
    ### Practical Application
    (Show real-world applications and provide concrete examples)
    ${session.preferences?.includePracticalExercises ? '### Practice Exercises\n(Provide 2-3 hands-on activities)' : ''}
    ### Key Takeaways
    (Summarize the most critical points in a concise list)`;
  }

  // Complete assembleFinalBook method
  async assembleFinalBook(book: BookProject, session: BookSession): Promise<void> {
    logger.info('Starting book assembly', { bookId: book.id });
    this.updateProgress(book.id, { status: 'assembling', progress: 90 });

    try {
      // Generate book components in parallel for efficiency
      const [introduction, summary, glossary] = await Promise.all([
        this.generateBookIntroduction(session, book.roadmap!),
        this.generateBookSummary(session, book.modules),
        this.generateGlossary(book.modules)
      ]);

      // Get provider info for attribution
      const providerName = this.getProviderDisplayName();
      const modelName = this.settings.selectedModel;
      const totalWords = book.modules.reduce((sum, module) => sum + module.wordCount, 0);

      // Assemble final book content
      const finalBookParts = [
        `# ${book.title}\n`,
        `**Generated on:** ${new Date().toLocaleDateString()}\n`,
        `**Total Word Count:** ${totalWords.toLocaleString()} words\n`,
        `**Estimated Reading Time:** ${book.roadmap!.estimatedReadingTime}\n`,
        `**Difficulty Level:** ${book.roadmap!.difficultyLevel}\n`,
        `**Generated using:** ${providerName} (${modelName})\n\n`,
        `---\n\n`,
        `## Table of Contents\n`,
        this.generateTableOfContents(book.modules),
        `\n\n---\n\n`,
        `## Introduction\n\n${introduction}\n\n---\n\n`,
        ...book.modules.map((module, index) =>
          `${module.content}\n\n${index < book.modules.length - 1 ? '---\n\n' : ''}`
        ),
        `\n---\n\n`,
        `## Summary & Conclusion\n\n${summary}\n\n---\n\n`,
        `## Glossary\n\n${glossary}\n\n---\n\n`,
        `## Suggested Next Steps\n\n`,
        this.generateNextSteps(session),
        `\n\n---\n\n`,
        `## About This Book\n\n`,
        `This book was automatically generated using AI technology to provide a comprehensive learning experience on "${session.goal}". `,
        `The content is structured to take you from foundational concepts to practical application, `,
        `making it suitable for ${session.targetAudience || 'learners'} at the ${session.complexityLevel || 'intermediate'} level.\n\n`,
        `**Generation Details:**\n`,
        `- Provider: ${providerName}\n`,
        `- Model: ${modelName}\n`,
        `- Modules: ${book.modules.length}\n`,
        `- Total Words: ${totalWords.toLocaleString()}\n`,
        `- Generated: ${new Date().toISOString()}\n`
      ];

      const finalBook = finalBookParts.join('');

      logger.info('Book assembly completed successfully', {
        bookId: book.id,
        finalLength: finalBook.length,
        totalWords
      });

      this.updateProgress(book.id, {
        status: 'completed',
        progress: 100,
        finalBook,
        totalWords
      });

    } catch (error) {
      logger.error('Book assembly failed', { bookId: book.id, error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during book assembly';
      this.updateProgress(book.id, {
        status: 'error',
        error: `Book assembly failed: ${errorMessage}`
      });
      throw error;
    }
  }

  // Helper methods for book assembly
  private getProviderDisplayName(): string {
    switch (this.settings.selectedProvider) {
      case 'google': return 'Google Gemini';
      case 'mistral': return 'Mistral AI';
      case 'zhipu': return 'ZhipuAI';
      default: return 'AI';
    }
  }

  private generateTableOfContents(modules: BookModule[]): string {
    const tocEntries = modules.map((module, index) =>
      `${index + 1}. [${module.title}](#${module.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')})`
    );
    return tocEntries.join('\n');
  }

  private generateNextSteps(session: BookSession): string {
    const steps = [
      '- Practice the concepts learned through hands-on projects',
      '- Join communities and forums related to your learning goal',
      '- Explore advanced topics that interest you most',
      '- Apply the knowledge to real-world scenarios',
      '- Share your learning journey with others'
    ];

    if (session.preferences?.includePracticalExercises) {
      steps.push('- Complete all the practice exercises from each chapter');
    }

    if (session.preferences?.includeExamples) {
      steps.push('- Experiment with and modify the provided examples');
    }

    return steps.join('\n');
  }

  private async generateBookIntroduction(session: BookSession, roadmap: BookRoadmap): Promise<string> {
    const prompt = `Generate a compelling introduction for a book about: "${session.goal}"

    ROADMAP OVERVIEW:
    ${roadmap.modules.map(m => `- ${m.title}: ${m.objectives.join(', ')}`).join('\n')}

    TARGET AUDIENCE: ${session.targetAudience || 'general learners'}
    DIFFICULTY LEVEL: ${roadmap.difficultyLevel}
    ESTIMATED TIME: ${roadmap.estimatedReadingTime}

    Write an introduction (800-1200 words) that:
    - Welcomes the reader and explains the book's purpose
    - Outlines what they will learn and achieve by the end
    - Briefly explains the book's structure based on the roadmap
    - Motivates the reader to begin their learning journey
    - Sets appropriate expectations for the book's difficulty level
    - Addresses common challenges and how this book helps overcome them
    Use engaging, conversational tone with markdown headers (##, ###) for structure.`;

    return await this.generateWithAI(prompt);
  }

  private async generateBookSummary(session: BookSession, modules: BookModule[]): Promise<string> {
    const modulesSummary = modules.map(m => `- ${m.title}`).join('\n');
    const totalWords = modules.reduce((sum, m) => sum + m.wordCount, 0);

    const prompt = `Generate a comprehensive summary and conclusion for a book about: "${session.goal}"

    MODULES COVERED:
    ${modulesSummary}

    BOOK STATS:
    - Total modules: ${modules.length}
    - Total word count: ${totalWords.toLocaleString()}
    - Target audience: ${session.targetAudience || 'general learners'}

    Write a conclusion (600-900 words) that:
    - Summarizes the key learning outcomes achieved throughout the book
    - Reinforces the most important concepts covered
    - Provides clear guidance on next steps and further learning paths
    - Congratulates the reader on completing the book
    - Offers potential resources or project ideas for continued growth
    - Reflects on the learning journey and transformation achieved
    Make it inspiring, actionable, and forward-looking.`;

    return await this.generateWithAI(prompt);
  }

  private async generateGlossary(modules: BookModule[]): Promise<string> {
    // Combine content from all modules, limiting total length for the prompt
    const allContent = modules.map(m => m.content).join('\n\n');
    const contentForGlossary = allContent.length > 12000 ?
      allContent.substring(0, 12000) + '...' :
      allContent;

    const prompt = `Extract key terms and create a glossary from the following book content:
    ${contentForGlossary}

    Create a glossary with:
    - 20-30 of the most important terms and concepts found in the text
    - Clear, concise definitions for each term (1-2 sentences each)
    - Terms must be in alphabetical order
    - Focus on technical terms, key concepts, and important terminology
    - Avoid overly basic or common words

    Format as markdown with this structure:
    **Term Name**: Definition here.
    **Another Term**: Another definition here.`;

    return await this.generateWithAI(prompt);
  }

  // Enhanced download functionality
  downloadAsMarkdown(project: BookProject): void {
    if (!project.finalBook) {
      logger.warn('Download attempted but no final book content available', { bookId: project.id });
      throw new Error('No book content available for download. Please ensure the book generation is completed.');
    }

    logger.info('Downloading book as markdown', { bookId: project.id, title: project.title });

    try {
      const blob = new Blob([project.finalBook], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      // Create a safe filename
      const safeTitle = project.title
        .replace(/[^a-z0-9\s-]/gi, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .toLowerCase()
        .substring(0, 50); // Limit length

      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const filename = `${safeTitle}_${timestamp}_book.md`;

      a.href = url;
      a.download = filename;
      a.style.display = 'none';

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.info('Book download completed successfully', { filename, bookId: project.id });

    } catch (error) {
      logger.error('Book download failed', { error, bookId: project.id });
      throw new Error('Failed to download book. Please try again.');
    }
  }

  // Additional utility methods
  getUsageStats() {
    return {
      ...this.tokenUsage,
      activeRequests: this.activeRequests.size,
      requestTimeout: this.requestTimeout
    };
  }

  resetUsageStats(): void {
    this.tokenUsage = {
      totalTokens: 0,
      requestCount: 0,
      lastReset: Date.now()
    };
    logger.info('Usage statistics reset');
  }

  updateRequestTimeout(timeoutMs: number): void {
    this.requestTimeout = Math.max(30000, Math.min(300000, timeoutMs)); // 30s to 5min
    logger.info('Request timeout updated', { timeout: this.requestTimeout });
  }
}

export const bookService = new BookGenerationService();
