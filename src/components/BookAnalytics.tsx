// src/components/BookAnalytics.tsx
import React, { useMemo } from 'react';
import { 
  BarChart3, Clock, BookOpen, Target, Download, 
  FileText, Brain, Hash
} from 'lucide-react';
import { BookProject } from '../types';
import { bookEnhancementService } from '../services/bookEnhancements';

interface BookAnalyticsProps {
  book: BookProject;
}

export function BookAnalytics({ book }: BookAnalyticsProps) {
  const analytics = useMemo(() => bookEnhancementService.analyzeBook(book), [book]);
  const studyMaterials = useMemo(() => bookEnhancementService.generateStudyMaterials(book), [book]);

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const downloadProgressTracker = () => {
    const content = bookEnhancementService.generateProgressTracker(book);
    downloadFile(content, `${book.title.replace(/ /g, '_')}_progress_tracker.md`, 'text/markdown;charset=utf-8');
  };

  const downloadStudySummary = () => {
    downloadFile(studyMaterials.summary, `${book.title.replace(/ /g, '_')}_summary.md`, 'text/markdown;charset=utf-8');
  };

  const complexityColor = {
    beginner: 'text-green-500',
    intermediate: 'text-yellow-500', 
    advanced: 'text-red-500'
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Main Analytics */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Book Analytics</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center"><div className="flex items-center justify-center w-12 h-12 bg-blue-500/10 rounded-lg mb-2 mx-auto"><Hash className="w-6 h-6 text-blue-500" /></div><div className="text-2xl font-bold">{analytics.totalWords.toLocaleString()}</div><div className="text-sm text-gray-400">Total Words</div></div>
          <div className="text-center"><div className="flex items-center justify-center w-12 h-12 bg-green-500/10 rounded-lg mb-2 mx-auto"><Clock className="w-6 h-6 text-green-500" /></div><div className="text-2xl font-bold">{analytics.readingTime}</div><div className="text-sm text-gray-400">Reading Time</div></div>
          <div className="text-center"><div className="flex items-center justify-center w-12 h-12 bg-purple-500/10 rounded-lg mb-2 mx-auto"><Brain className={`w-6 h-6 ${complexityColor[analytics.complexity]}`} /></div><div className={`text-2xl font-bold ${complexityColor[analytics.complexity]} capitalize`}>{analytics.complexity}</div><div className="text-sm text-gray-400">Complexity</div></div>
          <div className="text-center"><div className="flex items-center justify-center w-12 h-12 bg-orange-500/10 rounded-lg mb-2 mx-auto"><BookOpen className="w-6 h-6 text-orange-500" /></div><div className="text-2xl font-bold">{book.modules.length}</div><div className="text-sm text-gray-400">Modules</div></div>
        </div>
      </div>

      {/* Key Topics */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4"><Target className="w-5 h-5 text-purple-500" /><h4 className="text-lg font-semibold">Key Topics</h4></div>
        <div className="flex flex-wrap gap-2">
          {analytics.topics.map((topic, index) => (
            <span key={index} className="px-3 py-1 bg-purple-500/10 text-purple-400 rounded-full text-sm font-medium">{topic}</span>
          ))}
        </div>
      </div>

      {/* Study Materials */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4"><FileText className="w-5 h-5 text-green-500" /><h4 className="text-lg font-semibold">Study Materials</h4></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={downloadProgressTracker} className="flex items-center gap-3 p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg hover:border-green-500 transition-colors group"><div className="w-10 h-10 flex items-center justify-center bg-green-500/10 rounded-lg"><Download className="w-5 h-5 text-green-500" /></div><div className="text-left"><div className="font-semibold group-hover:text-green-400">Progress Tracker</div><div className="text-sm text-gray-400">Checklist for modules</div></div></button>
          <button onClick={downloadStudySummary} className="flex items-center gap-3 p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg hover:border-blue-500 transition-colors group"><div className="w-10 h-10 flex items-center justify-center bg-blue-500/10 rounded-lg"><Download className="w-5 h-5 text-blue-500" /></div><div className="text-left"><div className="font-semibold group-hover:text-blue-400">Study Summary</div><div className="text-sm text-gray-400">Key points & objectives</div></div></button>
        </div>
      </div>
    </div>
  );
}
