// src/services/bookEnhancements.ts
import { BookProject } from '../types';
import { generateId } from '../utils/helpers';

export interface BookTemplate {
  id: string;
  name: string;
  description: string;
  category: 'programming' | 'business' | 'science' | 'language' | 'creative' | 'general';
  systemPrompt: string;
  preferences: {
    includeExamples: boolean;
    includePracticalExercises: boolean;
    includeQuizzes: boolean;
  };
  estimatedModules: number;
  targetAudience: string;
}

export interface BookAnalytics {
  totalWords: number;
  readingTime: string;
  complexity: 'beginner' | 'intermediate' | 'advanced';
  topics: string[];
}

export interface BookSharingOptions {
  shareableLink?: string;
  collaborators?: string[];
  isPublic: boolean;
  licenseType: 'private' | 'cc-by' | 'cc-by-sa' | 'mit';
}

class BookEnhancementService {
  // Pre-defined book templates for quick starts
  getBookTemplates(): BookTemplate[] {
    return [
      {
        id: 'programming-basics',
        name: 'Programming Fundamentals',
        description: 'Complete guide to programming concepts and best practices',
        category: 'programming',
        systemPrompt: 'Create a comprehensive programming guide focusing on fundamental concepts, practical examples, and hands-on exercises. Include code snippets, debugging tips, and real-world projects.',
        preferences: {
          includeExamples: true,
          includePracticalExercises: true,
          includeQuizzes: true
        },
        estimatedModules: 12,
        targetAudience: 'Beginners to Programming'
      },
      {
        id: 'business-strategy',
        name: 'Business Strategy & Planning',
        description: 'Strategic thinking, market analysis, and business development',
        category: 'business',
        systemPrompt: 'Develop a comprehensive business strategy guide covering market analysis, competitive positioning, financial planning, and growth strategies. Include real case studies, frameworks, and actionable templates.',
        preferences: {
          includeExamples: true,
          includePracticalExercises: true,
          includeQuizzes: false
        },
        estimatedModules: 10,
        targetAudience: 'Entrepreneurs and Business Professionals'
      },
      {
        id: 'data-science',
        name: 'Data Science Mastery',
        description: 'Complete data science workflow from collection to insights',
        category: 'programming',
        systemPrompt: 'Create an end-to-end data science guide covering statistics, programming, machine learning, and data visualization. Focus on practical projects and industry best practices.',
        preferences: {
          includeExamples: true,
          includePracticalExercises: true,
          includeQuizzes: true
        },
        estimatedModules: 15,
        targetAudience: 'Aspiring Data Scientists'
      },
      {
        id: 'creative-writing',
        name: 'Creative Writing Workshop',
        description: 'Develop your creative writing skills across multiple genres',
        category: 'creative',
        systemPrompt: 'Guide writers through character development, plot structure, dialogue, and style across fiction, non-fiction, and poetry. Include writing exercises and critique frameworks.',
        preferences: {
          includeExamples: true,
          includePracticalExercises: true,
          includeQuizzes: false
        },
        estimatedModules: 8,
        targetAudience: 'Aspiring Writers'
      },
      {
        id: 'language-learning',
        name: 'Language Learning System',
        description: 'Systematic approach to mastering a new language',
        category: 'language',
        systemPrompt: 'Create a structured language learning program covering grammar, vocabulary, pronunciation, and cultural context. Include practical conversation scenarios and progressive exercises.',
        preferences: {
          includeExamples: true,
          includePracticalExercises: true,
          includeQuizzes: true
        },
        estimatedModules: 12,
        targetAudience: 'Language Learners'
      }
    ];
  }

  // Analyze book content for metrics and insights
  analyzeBook(book: BookProject): BookAnalytics {
    if (!book.finalBook || !book.modules.length) {
      return {
        totalWords: 0,
        readingTime: '0 minutes',
        complexity: 'beginner',
        topics: [],
      };
    }

    const totalWords = book.modules.reduce((sum, module) => sum + module.wordCount, 0);
    const readingTime = Math.ceil(totalWords / 250); // Average reading speed: 250 words/minute
    
    // Simple complexity analysis based on content patterns
    const content = book.finalBook.toLowerCase();
    const complexityIndicators = {
      beginner: ['basic', 'simple', 'introduction', 'getting started', 'fundamentals'],
      intermediate: ['advanced', 'complex', 'implementation', 'optimization', 'architecture'],
      advanced: ['sophisticated', 'enterprise', 'scalable', 'theoretical', 'research']
    };

    let complexity: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
    let maxScore = 0;

    Object.entries(complexityIndicators).forEach(([level, keywords]) => {
      const score = keywords.reduce((count, keyword) => 
        count + (content.match(new RegExp(keyword, 'g')) || []).length, 0);
      if (score > maxScore) {
        maxScore = score;
        complexity = level as 'beginner' | 'intermediate' | 'advanced';
      }
    });

    const topics = this.extractTopics(book);

    return {
      totalWords,
      readingTime: readingTime > 60 
        ? `${Math.floor(readingTime / 60)} hours ${readingTime % 60} minutes`
        : `${readingTime} minutes`,
      complexity,
      topics,
    };
  }

  private extractTopics(book: BookProject): string[] {
    if (!book.roadmap) return [];
    
    return book.roadmap.modules.map(module => 
      module.title.replace(/^\d+\.\s*/, '').trim()
    ).slice(0, 8);
  }

  // Generate reading progress tracker
  generateProgressTracker(book: BookProject): string {
    if (!book.roadmap) return '';

    const checkboxes = book.roadmap.modules.map((module, index) => 
      `- [ ] **Module ${index + 1}**: ${module.title} _(${module.estimatedTime})_`
    ).join('\n');

    return `
# ${book.title} - Reading Progress

## Progress Tracker
${checkboxes}

## Study Schedule Suggestion
- **Daily Reading**: 30-45 minutes
- **Weekly Goal**: 2-3 modules
- **Practice Time**: 15-30 minutes after each module

## Notes Section
_Use this space for your personal notes and insights_

---

**Tip**: Check off each module as you complete it to track your progress!
    `.trim();
  }

  // Export book data for sharing or backup
  exportBookData(book: BookProject): string {
    const exportData = {
      metadata: {
        id: book.id,
        title: book.title,
        goal: book.goal,
        language: book.language,
        status: book.status,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        analytics: this.analyzeBook(book)
      },
      roadmap: book.roadmap,
      modules: book.modules.map(module => ({
        id: module.id,
        title: module.title,
        wordCount: module.wordCount,
        status: module.status,
        generatedAt: module.generatedAt
      })),
      content: book.finalBook
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Import book from exported data
  importBookData(jsonData: string): BookProject {
    try {
      const data = JSON.parse(jsonData);
      
      return {
        ...data.metadata,
        id: generateId(), // Generate new ID for import
        roadmap: data.roadmap,
        modules: data.modules || [],
        finalBook: data.content,
        createdAt: new Date(data.metadata.createdAt),
        updatedAt: new Date()
      };
    } catch (error) {
      throw new Error('Invalid book data format');
    }
  }

  // Generate study materials from book content
  generateStudyMaterials(book: BookProject): {
    summary: string;
    practiceQuestions: Array<{ question: string; type: 'multiple-choice' | 'short-answer' }>;
  } {
    const summary = `
# ${book.title} - Study Summary

## Key Learning Objectives
${book.roadmap?.modules.map(m => `- ${m.objectives.join(', ')}`).join('\n') || ''}

## Important Topics
${this.analyzeBook(book).topics.map(topic => `- ${topic}`).join('\n')}

    `.trim();

    const practiceQuestions = [
      {
        question: `What are the main objectives covered in "${book.title}"?`,
        type: 'short-answer' as const
      },
      {
        question: `How would you apply the concepts from this book in a real-world scenario?`,
        type: 'short-answer' as const
      }
    ];

    return { summary, practiceQuestions };
  }
}

export const bookEnhancementService = new BookEnhancementService();
