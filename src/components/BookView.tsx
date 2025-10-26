// src/components/BookView.tsx - COMPLETE FILE with Live Word Counter & AI Thinking Indicators
import React, { useEffect, ReactNode, useMemo, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Book, Plus, Download, Trash2, Clock, CheckCircle, AlertCircle,
  Loader2, Target, Users, Brain, Sparkles,
  BarChart3, ListChecks, Play, Box, ArrowLeft, Check, BookText, RefreshCw, Edit, Save, X,
  FileText, Maximize2, Minimize2,
  List, Settings, Moon, ZoomIn, ZoomOut, BookOpen, 
  ChevronUp, RotateCcw, Palette, Hash, Activity, TrendingUp, Zap, Gauge,
  Terminal, Eye, EyeOff, Search
} from 'lucide-react';
import { BookProject, BookSession } from '../types/book';
import { bookService } from '../services/bookService';
import { BookAnalytics } from './BookAnalytics';
import { CustomSelect } from './CustomSelect';
import { logger } from '../utils/logger';

type AppView = 'list' | 'create' | 'detail';

// Generation Status Interface
interface GenerationStatus {
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
  aiStage?: 'analyzing' | 'writing' | 'examples' | 'polishing' | 'complete'; // NEW
}

interface GenerationStats {
  startTime: Date;
  totalModules: number;
  completedModules: number;
  failedModules: number;
  averageTimePerModule: number;
  estimatedTimeRemaining: number;
  totalWordsGenerated: number;
  wordsPerMinute: number;
}

interface BookViewProps {
  books: BookProject[];
  currentBookId: string | null;
  onCreateBookRoadmap: (session: BookSession) => Promise<void>;
  onGenerateAllModules: (book: BookProject, session: BookSession) => Promise<void>;
  onRetryFailedModules: (book: BookProject, session: BookSession) => Promise<void>;
  onAssembleBook: (book: BookProject, session: BookSession) => Promise<void>;
  onSelectBook: (id: string | null) => void;
  onDeleteBook: (id: string) => void;
  hasApiKey: boolean;
  view: AppView;
  setView: React.Dispatch<React.SetStateAction<AppView>>;
  onUpdateBookContent: (bookId: string, newContent: string) => void;
  showListInMain: boolean;
  setShowListInMain: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile?: boolean;
  generationStatus?: GenerationStatus;
  generationStats?: GenerationStats;
}

// ============================================================================
// NEW: Animated Word Counter Component (UPDATED)
// ============================================================================
function AnimatedWordCounter({ 
  targetCount, 
  duration = 500, // Faster updates
  label = "Total Words",
  isStreaming = false
}: { 
  targetCount: number; 
  duration?: number;
  label?: string;
  isStreaming?: boolean;
}) {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      // Instant update during streaming
      setDisplayCount(targetCount);
      return; // Skip animation
    }
    
    // Smooth animation when completed or not streaming
    const startCount = displayCount;
    const difference = targetCount - startCount;
    if (difference === 0) return;
    
    const startTime = Date.now();
    
    const animateCount = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentCount = Math.floor(startCount + (difference * easeOutQuart));
      
      setDisplayCount(currentCount);
      
      if (progress < 1) {
        requestAnimationFrame(animateCount);
      } else {
        setDisplayCount(targetCount);
      }
    };
    
    requestAnimationFrame(animateCount);
  }, [targetCount, duration, isStreaming, displayCount]);

  return (
    <div className={`relative bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg p-3 border border-blue-500/20 ${
      isStreaming ? 'word-counter-streaming' : '' // Add class for glow effect
    }`}>
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 flex items-center justify-center bg-blue-500/20 rounded-lg ${
          isStreaming ? 'animate-pulse' : ''
        }`}>
          <Hash className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
            {label}
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold font-mono bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {displayCount.toLocaleString()}
            </span>
            {isStreaming && (
              <TrendingUp className="w-3 h-3 text-green-400 animate-bounce" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NEW: AI Thinking Indicator Component
// ============================================================================
type AIThinkingStage = 'analyzing' | 'writing' | 'examples' | 'polishing' | 'complete';

const stageConfig: Record<AIThinkingStage, {
  icon: React.ElementType;
  message: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  analyzing: {
    icon: Brain,
    message: '🧠 Analyzing module objectives...',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30'
  },
  writing: {
    icon: Edit,
    message: '✍️ Writing core concepts...',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30'
  },
  examples: {
    icon: Search,
    message: '🔍 Adding practical examples...',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30'
  },
  polishing: {
    icon: Sparkles,
    message: '✨ Polishing content and formatting...',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30'
  },
  complete: {
    icon: CheckCircle,
    message: '✓ Module complete!',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30'
  }
};

function AIThinkingIndicator({ stage, progress = 0 }: { stage: AIThinkingStage; progress?: number }) {
  const config = stageConfig[stage];
  const Icon = config.icon;

  return (
    <div className={`relative rounded-lg border ${config.borderColor} ${config.bgColor} p-3 overflow-hidden`}>
      <div className="flex items-center gap-2.5 relative z-10">
        <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${config.bgColor} ${
          stage !== 'complete' ? 'animate-pulse' : ''
        }`}>
          <Icon className={`w-4 h-4 ${config.color} ${
            stage !== 'complete' ? 'animate-spin' : ''
          }`} style={{
            animationDuration: stage === 'analyzing' ? '3s' : stage === 'writing' ? '2s' : '1.5s'
          }} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${config.color}`}>
              {config.message}
            </span>
            {stage !== 'complete' && (
              <div className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-current opacity-100 animate-bounce" 
                      style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-current opacity-100 animate-bounce" 
                      style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-current opacity-100 animate-bounce" 
                      style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
          
          {progress > 0 && (
            <div className="w-full bg-black/30 rounded-full h-1 overflow-hidden mt-1.5">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${config.bgColor.replace('/10', '/40')}`}
                style={{ 
                  width: `${progress}%`,
                  boxShadow: `0 0 8px ${config.color.replace('text-', '').replace('-400', '')}`
                }}
              />
            </div>
          )}
        </div>
      </div>
      
      {stage !== 'complete' && (
        <div className="absolute inset-0 pointer-events-none">
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              background: `linear-gradient(90deg, transparent, ${config.color.replace('text-', 'rgba(').replace('-400', ', 0.1)')}, transparent)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s infinite'
            }}
          />
        </div>
      )}
    </div>
  );
}

// Embedded Progress Panel Component with NEW FEATURES (UPDATED)
const EmbeddedProgressPanel = ({ 
  generationStatus, 
  stats, 
  onCancel 
}: { 
  generationStatus: GenerationStatus;
  stats: GenerationStats;
  onCancel?: () => void;
}) => {
  const [eventLog, setEventLog] = useState(() => logger.getLogs());
  const [showEventLog, setShowEventLog] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const streamBoxRef = useRef<HTMLDivElement>(null); // Ref for auto-scroll

  // Effect for auto-scrolling the live stream box
  useEffect(() => {
    if (streamBoxRef.current && generationStatus.currentModule?.generatedText) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [generationStatus.currentModule?.generatedText]);

  useEffect(() => {
    const unsubscribe = logger.subscribe(setEventLog);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showEventLog && logContainerRef.current) {
        logContainerRef.current.scrollTop = 0;
    }
  }, [eventLog, showEventLog]);

  const handleDownloadLogs = () => {
    const logsContent = logger.exportLogs();
    const blob = new Blob([logsContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pustakam-generation-log-${new Date().toISOString().replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 1) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const overallProgress = (stats.completedModules / (stats.totalModules || 1)) * 100;

  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Generation In Progress</h3>
              <p className="text-sm text-gray-400">
                Module {stats.completedModules + 1} of {stats.totalModules}
              </p>
            </div>
          </div>
          {onCancel && (
            <button 
              onClick={onCancel}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
            <span>Overall Progress</span>
            <span className="font-mono font-bold text-white">{Math.round(overallProgress)}%</span>
          </div>
          <div className="w-full bg-gray-800/50 rounded-full h-3 overflow-hidden border border-gray-700">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 relative"
              style={{ width: `${overallProgress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* NEW: AI Thinking Indicator - now driven by service */}
      {generationStatus && generationStatus.currentModule && (
        <AIThinkingIndicator 
          stage={generationStatus.aiStage || 'analyzing'}
          progress={generationStatus.currentModule.progress}
        />
      )}


      {/* Current Module */}
      {generationStatus.currentModule && generationStatus.currentModule.generatedText && (
        <div className="bg-black/20 rounded-lg p-4 border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              {generationStatus.currentModule.title}
            </h4>
            {generationStatus.currentModule.attempt > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-md border border-yellow-500/20">
                <RefreshCw className="w-3 h-3" />
                <span>Attempt {generationStatus.currentModule.attempt}</span>
              </div>
            )}
          </div>
          
          <div
            ref={streamBoxRef}
            className="bg-[var(--color-bg)] rounded-lg p-3 max-h-24 overflow-y-auto border border-[var(--color-border)] text-xs text-gray-300 leading-relaxed font-mono streaming-text-box"
          >
            <Zap className="w-3 h-3 text-yellow-400 inline-block mr-2" />
            {generationStatus.currentModule.generatedText}
            <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-1"></span>
          </div>
        </div>
      )}

      {/* Statistics Grid with NEW Animated Word Counter */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-400">Completed</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">{stats.completedModules}</div>
        </div>
        
        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <X className="w-4 h-4 text-red-400" />
            <span className="text-xs text-gray-400">Failed</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">{stats.failedModules}</div>
        </div>
        
        {/* UPDATED: Animated Word Counter with streaming prop */}
        <AnimatedWordCounter 
          targetCount={stats.totalWordsGenerated}
          duration={300}
          label="Words"
          isStreaming={generationStatus.status === 'generating'}
        />
        
        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-400">WPM</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">{stats.wordsPerMinute.toFixed(0)}</div>
        </div>
        
        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-gray-400">Avg Time</span>
          </div>
          <div className="text-lg font-bold text-white font-mono">{formatTime(stats.averageTimePerModule)}</div>
        </div>
        
        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-400">Est. Time</span>
          </div>
          <div className="text-lg font-bold text-white font-mono">{formatTime(stats.estimatedTimeRemaining)}</div>
        </div>
      </div>

      {/* System Log */}
      <div className="bg-black/20 p-3 rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" />
                SYSTEM LOG
            </h4>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setShowEventLog(!showEventLog)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    title={showEventLog ? 'Collapse log' : 'Expand log'}
                >
                    {showEventLog ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button
                    onClick={handleDownloadLogs}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    title="Download full log"
                >
                    <Download className="w-3 h-3 text-blue-400" />
                </button>
            </div>
        </div>
        
        {showEventLog && (
            <div ref={logContainerRef} className="max-h-[180px] overflow-y-auto space-y-2 text-xs font-mono bg-[var(--color-bg)] p-2 rounded-md border border-[var(--color-border)]">
                {eventLog.length === 0 ? (
                    <div className="text-gray-500 text-center py-4">No logs yet...</div>
                ) : (
                    eventLog.map(log => (
                        <div key={log.id} className="flex gap-2 items-start">
                            <span className="text-gray-500 shrink-0">{log.timestamp}</span>
                            <span className={`${
                                log.type === 'success' ? 'text-green-400' : 
                                log.type === 'warn' ? 'text-yellow-400' :
                                log.type === 'error' ? 'text-red-400' :
                                'text-gray-300'
                            }`}>
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
        )}
        
        {!showEventLog && generationStatus.logMessage && (
            <div className="text-xs text-gray-400 font-mono truncate">
                {generationStatus.logMessage}
            </div>
        )}
      </div>
    </div>
  );
};

const CodeBlock = React.memo(({ children, language, theme }: any) => (
  <SyntaxHighlighter
    style={vscDarkPlus}
    language={language}
    PreTag="div"
    className={`!rounded-xl !my-6 !text-sm border ${
      theme === 'dark' ? '!bg-[#0D1117] border-gray-700' :
      '!bg-[#F0EAD6] border-[#D4C4A8] !text-gray-800'
    }`}
    customStyle={{
      padding: '1.5rem',
      fontSize: '0.875rem',
      lineHeight: '1.5'
    }}
  >
    {String(children).replace(/\n$/, '')}
  </SyntaxHighlighter>
));

const HomeView = ({ onNewBook, onShowList, hasApiKey, bookCount }: { onNewBook: () => void; onShowList: () => void; hasApiKey: boolean; bookCount: number }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
    <div className="absolute inset-0 bg-black [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
    <div className="relative z-10 max-w-2xl mx-auto animate-fade-in-up">
      <div className="relative w-28 h-28 mx-auto mb-6">
        <div className="absolute inset-0 bg-blue-500 rounded-full blur-2xl opacity-30 animate-subtle-glow"></div>
        <img src="/white-logo.png" alt="Pustakam Logo" className="w-28 h-28 relative" />
      </div>
      <h1 className="text-5xl font-bold mb-4 text-white">Turn Ideas into Books</h1>
      <p className="text-xl text-[var(--color-text-secondary)] mb-10">
        Pustakam is an AI-powered engine that transforms your concepts into fully-structured digital books.
      </p>
      {hasApiKey ? (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={onNewBook} className="btn btn-primary btn-lg shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/20 w-full sm:w-auto">
            <Sparkles className="w-5 h-5" />
            Create New Book
          </button>
          {bookCount > 0 && (
            <button onClick={onShowList} className="btn btn-secondary w-full sm:w-auto">
              <List className="w-4 h-4" />
              View My Books
            </button>
          )}
        </div>
      ) : (
        <div className="content-card p-6 max-w-md mx-auto">
          <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
          <h3 className="font-semibold mb-2">API Key Required</h3>
          <p className="text-sm text-gray-400">Please configure your API key in Settings to begin.</p>
        </div>
      )}
    </div>
  </div>
);

const BookListGrid = ({
  books,
  onSelectBook,
  onDeleteBook,
  setView,
  setShowListInMain
}: {
  books: BookProject[];
  onSelectBook: (id: string) => void;
  onDeleteBook: (id: string) => void;
  setView: (view: AppView) => void;
  setShowListInMain: (show: boolean) => void;
}) => {
  const getStatusIcon = (status: BookProject['status']) => {
    const iconMap: Record<BookProject['status'], React.ElementType> = {
      planning: Clock,
      generating_roadmap: Loader2,
      roadmap_completed: ListChecks,
      generating_content: Loader2,
      assembling: Box,
      completed: CheckCircle,
      error: AlertCircle,
    };
    const Icon = iconMap[status] || Loader2;
    const colorClass = status === 'completed' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-blue-500';
    const animateClass = ['generating_roadmap', 'generating_content', 'assembling'].includes(status) ? 'animate-spin' : '';
    return <Icon className={`w-5 h-5 ${colorClass} ${animateClass}`} />;
  };

  const getStatusText = (status: BookProject['status']) => ({
    planning: 'Planning',
    generating_roadmap: 'Creating Roadmap',
    roadmap_completed: 'Ready to Write',
    generating_content: 'Writing Chapters',
    assembling: 'Finalizing Book',
    completed: 'Completed',
    error: 'Error',
  }[status] || 'Unknown');

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Books</h1>
            <p className="text-gray-400">{books.length} projects</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => { setView('create'); setShowListInMain(false); }} className="btn btn-primary">
              <Plus className="w-4 h-4" /> New Book
            </button>
            <button onClick={() => setShowListInMain(false)} className="btn btn-secondary">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:gap-6">
          {books.map(book => (
            <div key={book.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 sm:p-6 transition-all hover:border-gray-600 hover:shadow-lg cursor-pointer group" onClick={() => onSelectBook(book.id)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(book.status)}
                    <h3 className="text-lg font-semibold text-white truncate group-hover:text-blue-300 transition-colors">{book.title}</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">{book.goal}</p>
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(book.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span className="capitalize">{getStatusText(book.status)}</span>
                    {book.status !== 'completed' && book.status !== 'error' && (<span>{Math.round(book.progress)}%</span>)}
                    {book.modules.length > 0 && (<span>{book.modules.length} modules</span>)}
                  </div>
                  {book.status !== 'completed' && book.status !== 'error' && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-800/50 rounded-full h-2.5 overflow-hidden border border-gray-700">
                        <div
                          className="bg-gradient-to-r from-green-500 via-green-400 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out relative"
                          style={{ width: `${Math.min(100, Math.max(0, book.progress))}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {book.status === 'completed' && (
                    <button onClick={(e) => { e.stopPropagation(); bookService.downloadAsMarkdown(book); }} className="btn-ghost p-2 opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); onDeleteBook(book.id); }} className="btn-ghost p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DetailTabButton = ({
  label,
  Icon,
  isActive,
  onClick
}: {
  label: ReactNode;
  Icon: React.ElementType;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
      isActive
        ? 'bg-[var(--color-card)] text-[var(--color-text-primary)] shadow-sm'
        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-card)] hover:text-white'
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

interface ReadingModeProps {
  content: string;
  isEditing: boolean;
  editedContent: string;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onContentChange: (content: string) => void;
}

interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: 'serif' | 'sans' | 'mono';
  theme: 'dark' | 'sepia';
  maxWidth: 'narrow' | 'medium' | 'wide';
  textAlign: 'left' | 'justify';
}

const THEMES = {
  dark: {
    bg: '#0F0F0F',
    contentBg: '#1A1A1A',
    text: '#E5E5E5',
    secondary: '#A0A0A0',
    border: '#333333',
    accent: '#6B7280'
  },
  sepia: {
    bg: '#F5F1E8',
    contentBg: '#FAF7F0',
    text: '#3C2A1E',
    secondary: '#8B7355',
    border: '#D4C4A8',
    accent: '#B45309'
  }
};

const FONT_FAMILIES = {
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  sans: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Monaco", "Cascadia Code", monospace'
};

const MAX_WIDTHS = {
  narrow: '65ch',
  medium: '75ch',
  wide: '85ch'
};

const ReadingMode: React.FC<ReadingModeProps> = ({
  content,
  isEditing,
  editedContent,
  onEdit,
  onSave,
  onCancel,
  onContentChange,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const settingsTimeoutRef = useRef<NodeJS.Timeout>();

  const [settings, setSettings] = useState<ReadingSettings>(() => {
    const saved = localStorage.getItem('pustakam-reading-settings');
    const parsed = saved ? JSON.parse(saved) : {};
    if (parsed.theme === 'light') parsed.theme = 'dark';
    return {
      fontSize: 18,
      lineHeight: 1.7,
      fontFamily: 'serif',
      theme: 'dark',
      maxWidth: 'medium',
      textAlign: 'left',
      ...parsed,
    };
  });

  useEffect(() => {
    localStorage.setItem('pustakam-reading-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(progress);
      setShowScrollTop(scrollTop > 500);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isFullscreen]);

  useEffect(() => {
    if (showSettings) {
      if (settingsTimeoutRef.current) clearTimeout(settingsTimeoutRef.current);
      settingsTimeoutRef.current = setTimeout(() => setShowSettings(false), 5000);
    }
    return () => {
      if (settingsTimeoutRef.current) clearTimeout(settingsTimeoutRef.current);
    };
  }, [showSettings]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'auto';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      } else if (e.key === 'F11') {
        e.preventDefault();
      } else if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setSettings(prev => ({ ...prev, fontSize: Math.min(28, prev.fontSize + 1) }));
        } else if (e.key === '-') {
          e.preventDefault();
          setSettings(prev => ({ ...prev, fontSize: Math.max(12, prev.fontSize - 1) }));
        } else if (e.key === '0') {
          e.preventDefault();
          setSettings(prev => ({ ...prev, fontSize: 18 }));
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const currentTheme = THEMES[settings.theme];
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const updateSetting = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (settingsTimeoutRef.current) clearTimeout(settingsTimeoutRef.current);
    settingsTimeoutRef.current = setTimeout(() => setShowSettings(false), 5000);
  };

  if (isEditing) {
    return (
      <div className="animate-fade-in">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-[var(--color-bg)] z-30 pt-4 pb-2 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Editing Mode
          </h3>
          <div className="flex gap-3">
            <button onClick={onCancel} className="btn btn-secondary">
              <X size={16} /> Cancel
            </button>
            <button onClick={onSave} className="btn btn-primary">
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
        <textarea
          className="w-full h-[70vh] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-white font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          value={editedContent}
          onChange={(e) => onContentChange(e.target.value)}
          style={{ fontSize: `${settings.fontSize - 2}px` }}
        />
      </div>
    );
  }

  const fullscreenStyles = isFullscreen ? {
    backgroundColor: currentTheme.bg,
    color: currentTheme.text,
    minHeight: '100vh'
  } : {};

  const contentStyles = {
    fontFamily: FONT_FAMILIES[settings.fontFamily],
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    maxWidth: MAX_WIDTHS[settings.maxWidth],
    textAlign: settings.textAlign as any,
    backgroundColor: isFullscreen ? currentTheme.contentBg : undefined,
    color: isFullscreen ? currentTheme.text : undefined,
    padding: isFullscreen ? '3rem 2rem' : undefined,
    margin: isFullscreen ? '0 auto' : undefined,
    borderRadius: isFullscreen ? '0' : undefined,
    boxShadow: isFullscreen && settings.theme !== 'light' ? '0 0 80px rgba(0,0,0,0.5)' : isFullscreen ? '0 0 40px rgba(0,0,0,0.1)' : undefined
  };

  return (
    <div className={`reading-container theme-${settings.theme} ${isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto' : ''}`} style={fullscreenStyles}>
      {isFullscreen && (
        <div className="fixed top-0 left-0 h-1 z-50 transition-all duration-200" style={{ width: `${scrollProgress}%`, backgroundColor: currentTheme.accent }} />
      )}

      {isFullscreen ? (
        <>
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
            <button onClick={() => setShowSettings(!showSettings)} className="p-3 rounded-xl transition-all duration-200" style={{ backgroundColor: showSettings ? currentTheme.accent : 'rgba(0,0,0,0.7)', color: showSettings ? 'white' : currentTheme.text, backdropFilter: 'blur(10px)' }} title="Reading settings">
              <Settings size={18} />
            </button>
            <button onClick={onEdit} className="p-3 rounded-xl transition-all duration-200" style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: currentTheme.text, backdropFilter: 'blur(10px)' }} title="Edit content">
              <Edit size={18} />
            </button>
            <button onClick={() => setIsFullscreen(false)} className="p-3 rounded-xl transition-all duration-200" style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: currentTheme.text, backdropFilter: 'blur(10px)' }} title="Exit fullscreen (Esc)">
              <Minimize2 size={18} />
            </button>
          </div>

          {showSettings && (
            <div className="fixed top-16 right-4 z-50 p-6 rounded-2xl shadow-2xl min-w-[280px] animate-fade-in-up" style={{ backgroundColor: currentTheme.contentBg, border: `1px solid ${currentTheme.border}`, color: currentTheme.text, backdropFilter: 'blur(20px)' }}>
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <BookOpen size={16} />
                Reading Settings
              </h4>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Font Size</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateSetting('fontSize', Math.max(12, settings.fontSize - 1))} className="p-2 rounded-lg transition-colors" style={{ backgroundColor: currentTheme.bg }}>
                    <ZoomOut size={14} />
                  </button>
                  <span className="min-w-[3rem] text-center font-mono">{settings.fontSize}px</span>
                  <button onClick={() => updateSetting('fontSize', Math.min(28, settings.fontSize + 1))} className="p-2 rounded-lg transition-colors" style={{ backgroundColor: currentTheme.bg }}>
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Line Spacing</label>
                <input type="range" min="1.2" max="2.2" step="0.1" value={settings.lineHeight} onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))} className="w-full" style={{ accentColor: currentTheme.accent }} />
                <div className="text-xs opacity-70 mt-1">{settings.lineHeight.toFixed(1)}</div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Font Style</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['serif', 'sans', 'mono'] as const).map((font) => (
                    <button key={font} onClick={() => updateSetting('fontFamily', font)} className={`p-2 text-xs rounded-lg transition-all ${settings.fontFamily === font ? 'font-semibold' : ''}`} style={{ backgroundColor: settings.fontFamily === font ? currentTheme.accent : currentTheme.bg, color: settings.fontFamily === font ? 'white' : currentTheme.text, fontFamily: FONT_FAMILIES[font] }}>
                      {font === 'serif' ? 'Serif' : font === 'sans' ? 'Sans' : 'Mono'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Theme</label>
                <div className="flex gap-1">
                  {(['dark', 'sepia'] as const).map((theme) => (
                    <button key={theme} onClick={() => updateSetting('theme', theme)} className={`flex-1 p-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 ${settings.theme === theme ? 'font-semibold' : ''}`} style={{ backgroundColor: settings.theme === theme ? currentTheme.accent : currentTheme.bg, color: settings.theme === theme ? 'white' : currentTheme.text }}>
                      {theme === 'dark' ? <Moon size={12} /> : <Palette size={12} />}
                      {theme.charAt(0).toUpperCase() + theme.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Column Width</label>
                <div className="flex gap-1">
                  {(['narrow', 'medium', 'wide'] as const).map((width) => (
                    <button key={width} onClick={() => updateSetting('maxWidth', width)} className={`flex-1 p-2 text-xs rounded-lg transition-all ${settings.maxWidth === width ? 'font-semibold' : ''}`} style={{ backgroundColor: settings.maxWidth === width ? currentTheme.accent : currentTheme.bg, color: settings.maxWidth === width ? 'white' : currentTheme.text }}>
                      {width.charAt(0).toUpperCase() + width.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setSettings({ fontSize: 18, lineHeight: 1.7, fontFamily: 'serif', theme: 'dark', maxWidth: 'medium', textAlign: 'left' })} className="w-full p-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1" style={{ backgroundColor: currentTheme.bg, color: currentTheme.secondary }}>
                <RotateCcw size={12} />
                Reset to Defaults
              </button>
            </div>
          )}

          {showScrollTop && (
            <button onClick={scrollToTop} className="fixed bottom-8 right-8 p-4 rounded-full shadow-lg transition-all duration-300 animate-fade-in" style={{ backgroundColor: currentTheme.accent, color: 'white' }} title="Scroll to top">
              <ChevronUp size={20} />
            </button>
          )}
        </>
      ) : (
        <div className="flex justify-end items-center gap-3 mb-6 sticky top-0 bg-[var(--color-bg)] z-10 py-2">
          <button onClick={onEdit} className="btn btn-secondary btn-sm">
            <Edit size={14} /> Edit
          </button>
          <button onClick={() => setIsFullscreen(true)} className="btn btn-secondary btn-sm" title="Enter fullscreen reading mode">
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      <div ref={contentRef} style={isFullscreen ? { paddingTop: '2rem' } : {}}>
        <article className={`prose prose-invert prose-lg max-w-none transition-all duration-300 ${isFullscreen ? 'mx-auto' : ''}`} style={contentStyles}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: (props) => <CodeBlock {...props} theme={settings.theme} /> }} className="focus:outline-none">
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
};

// Main BookView Export Component
export function BookView({
  books,
  currentBookId,
  onCreateBookRoadmap,
  onGenerateAllModules,
  onRetryFailedModules,
  onAssembleBook,
  onSelectBook,
  onDeleteBook,
  hasApiKey,
  view,
  setView,
  onUpdateBookContent,
  showListInMain,
  setShowListInMain,
  isMobile = false,
  generationStatus,
  generationStats,
}: BookViewProps) {
  const [detailTab, setDetailTab] = useState<'overview' | 'analytics' | 'read'>('overview');
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState<BookSession>({
    goal: '',
    language: 'en',
    targetAudience: '',
    complexityLevel: 'intermediate',
    preferences: {
      includeExamples: true,
      includePracticalExercises: false,
      includeQuizzes: false,
    },
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const currentBook = currentBookId ? books.find(b => b.id === currentBookId) : null;

  useEffect(() => {
    if (currentBook) {
      setIsGenerating(['generating_roadmap', 'generating_content', 'assembling'].includes(currentBook.status));
      setIsEditing(false);
    }
  }, [currentBook]);

  useEffect(() => {
    return () => {
      if (currentBookId) {
        bookService.cancelActiveRequests(currentBookId);
      }
    };
  }, [currentBookId]);

  const handleCreateRoadmap = async () => {
    if (!formData.goal.trim() || !hasApiKey) return;
    setIsGenerating(true);
    try {
      await onCreateBookRoadmap(formData);
    } catch (error) {
      console.error('Failed to create roadmap:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartGeneration = async () => {
    if (!currentBook) return;
    setIsGenerating(true);
    try {
      await onGenerateAllModules(currentBook, {
        goal: currentBook.goal,
        language: currentBook.language,
        targetAudience: formData.targetAudience,
        complexityLevel: formData.complexityLevel,
        preferences: formData.preferences
      });
    } catch (error) {
      console.error('Failed to generate modules:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartAssembly = async () => {
    if (!currentBook) return;
    setIsGenerating(true);
    try {
      await onAssembleBook(currentBook, {
        goal: currentBook.goal,
        language: currentBook.language,
        targetAudience: formData.targetAudience,
        complexityLevel: formData.complexityLevel,
        preferences: formData.preferences
      });
    } catch (error) {
      console.error('Failed to assemble book:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartEditing = () => {
    if (currentBook?.finalBook) {
      setEditedContent(currentBook.finalBook);
      setIsEditing(true);
    }
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditedContent('');
  };

  const handleSaveChanges = () => {
    if (currentBook && editedContent) {
      onUpdateBookContent(currentBook.id, editedContent);
      setIsEditing(false);
      setEditedContent('');
    }
  };

  const handleDownloadLogs = () => {
    const logsContent = logger.exportLogs();
    const blob = new Blob([logsContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pustakam-generation-log-${new Date().toISOString().replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: BookProject['status']) => {
    const iconMap: Record<BookProject['status'], React.ElementType> = {
      planning: Clock,
      generating_roadmap: Loader2,
      roadmap_completed: ListChecks,
      generating_content: Loader2,
      assembling: Box,
      completed: CheckCircle,
      error: AlertCircle,
    };
    const Icon = iconMap[status] || Loader2;
    const colorClass = status === 'completed' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-blue-500';
    const animateClass = ['generating_roadmap', 'generating_content', 'assembling'].includes(status) ? 'animate-spin' : '';
    return <Icon className={`w-5 h-5 ${colorClass} ${animateClass}`} />;
  };

  const getStatusText = (status: BookProject['status']) => ({
    planning: 'Planning',
    generating_roadmap: 'Creating Roadmap',
    roadmap_completed: 'Ready to Write',
    generating_content: 'Writing Chapters',
    assembling: 'Finalizing Book',
    completed: 'Completed',
    error: 'Error',
  }[status] || 'Unknown');

  if (view === 'list') {
    if (showListInMain) {
      return (
        <BookListGrid
          books={books}
          onSelectBook={onSelectBook}
          onDeleteBook={onDeleteBook}
          setView={setView}
          setShowListInMain={setShowListInMain}
        />
      );
    }
    return (
      <HomeView
        onNewBook={() => setView('create')}
        onShowList={() => setShowListInMain(true)}
        hasApiKey={hasApiKey}
        bookCount={books.length}
      />
    );
  }

  if (view === 'create') {
    return (
      <div className="flex-1 flex flex-col h-full">
        <div className="p-6 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-4">
            <button onClick={() => { setView('list'); setShowListInMain(false); }} className="btn-ghost p-2">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Create New Book</h1>
              <p className="text-gray-400">Define your learning goal and let AI do the rest.</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="content-card p-6">
              <div className="space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-lg font-semibold mb-2">
                    <Target size={18} className="text-blue-400" />
                    Learning Goal
                  </label>
                  <textarea
                    value={formData.goal}
                    onChange={e => setFormData(p => ({ ...p, goal: e.target.value }))}
                    placeholder="e.g., Learn Python for Data Science..."
                    className="textarea-style focus:ring-blue-500/50"
                    rows={3}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 font-semibold mb-2">
                      <Users size={16} className="text-green-400" />
                      Target Audience
                    </label>
                    <input
                      type="text"
                      value={formData.targetAudience}
                      onChange={e => setFormData(p => ({ ...p, targetAudience: e.target.value }))}
                      placeholder="e.g., Beginners, Professionals..."
                      className="input-style focus:ring-green-500/50"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 font-semibold mb-2">
                      <Brain size={16} className="text-yellow-400" />
                      Complexity
                    </label>
                    <CustomSelect
                      value={formData.complexityLevel || 'intermediate'}
                      onChange={val => setFormData(p => ({ ...p, complexityLevel: val as any }))}
                      options={[
                        { value: 'beginner', label: 'Beginner' },
                        { value: 'intermediate', label: 'Intermediate' },
                        { value: 'advanced', label: 'Advanced' },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold mb-3 block">Preferences</label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.preferences?.includeExamples}
                        onChange={e => setFormData(p => ({ ...p, preferences: { ...p.preferences!, includeExamples: e.target.checked } }))}
                        className="w-4 h-4 accent-blue-500"
                      />
                      Include Examples
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.preferences?.includePracticalExercises}
                        onChange={e => setFormData(p => ({ ...p, preferences: { ...p.preferences!, includePracticalExercises: e.target.checked } }))}
                        className="w-4 h-4 accent-blue-500"
                      />
                      Include Exercises
                    </label>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleCreateRoadmap}
                    disabled={!formData.goal.trim() || !hasApiKey || isGenerating}
                    className="btn btn-primary btn-lg w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        Create Roadmap
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && currentBook) {
    const areAllModulesDone = currentBook.roadmap && currentBook.modules.length === currentBook.roadmap.modules.length && currentBook.modules.every(m => m.status === 'completed');
    const failedModules = currentBook.modules.filter(m => m.status === 'error');
    const completedModules = currentBook.modules.filter(m => m.status === 'completed');

    return (
      <div className="flex-1 flex flex-col h-full">
        <div className="p-4 sm:p-6 border-b border-[var(--color-border)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { setView('list'); onSelectBook(null); setShowListInMain(true); }} className="btn-ghost p-2">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">{currentBook.title}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {getStatusIcon(currentBook.status)}
                    {getStatusText(currentBook.status)}
                  </div>
                </div>
              </div>
            </div>
            {currentBook.status === 'completed' && (
              <button onClick={() => bookService.downloadAsMarkdown(currentBook)} className="btn btn-secondary">
                <Download size={16} />
                Download .md
              </button>
            )}
          </div>
          {currentBook.status === 'completed' && (
            <div className="mt-4 flex items-center gap-2">
              <DetailTabButton label="Overview" Icon={ListChecks} isActive={detailTab === 'overview'} onClick={() => setDetailTab('overview')} />
              <DetailTabButton label="Analytics" Icon={BarChart3} isActive={detailTab === 'analytics'} onClick={() => setDetailTab('analytics')} />
              <DetailTabButton label="Read Book" Icon={BookText} isActive={detailTab === 'read'} onClick={() => setDetailTab('read')} />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className={detailTab === 'read' ? '' : 'p-4 sm:p-6'}>
            <div className={detailTab === 'read' ? '' : 'max-w-4xl mx-auto'}>
              {detailTab === 'analytics' && currentBook.status === 'completed' ? (
                <BookAnalytics book={currentBook} />
              ) : detailTab === 'read' && currentBook.status === 'completed' ? (
                <div className="px-4 sm:px-6 py-6">
                  <ReadingMode
                    content={currentBook.finalBook || ''}
                    isEditing={isEditing}
                    editedContent={editedContent}
                    onEdit={handleStartEditing}
                    onSave={handleSaveChanges}
                    onCancel={handleCancelEditing}
                    onContentChange={setEditedContent}
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Book Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-400">Goal:</span><p className="font-medium">{currentBook.goal}</p></div>
                      <div><span className="text-gray-400">Created:</span><p className="font-medium">{new Date(currentBook.createdAt).toLocaleDateString()}</p></div>
                      <div><span className="text-gray-400">Language:</span><p className="font-medium">{currentBook.language === 'en' ? 'English' : 'Marathi'}</p></div>
                      <div><span className="text-gray-400">Modules:</span><p className="font-medium">{currentBook.modules.length} / {currentBook.roadmap?.modules.length || '...'} completed</p></div>
                    </div>
                  </div>

                  {/* EMBEDDED PROGRESS PANEL */}
                  {currentBook.status === 'generating_content' && generationStatus && generationStats && (
                    <EmbeddedProgressPanel
                      generationStatus={generationStatus}
                      stats={generationStats}
                      onCancel={() => {
                        if (window.confirm('Cancel generation? Progress will be saved.')) {
                          bookService.cancelActiveRequests(currentBook.id);
                          setIsGenerating(false);
                        }
                      }}
                    />
                  )}

                  {/* START GENERATION CARD */}
                  {currentBook.status === 'roadmap_completed' && !areAllModulesDone && currentBook.status !== 'generating_content' && (
                    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 flex items-center justify-center bg-blue-500/10 rounded-lg">
                          <Play className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Ready to Generate Content</h3>
                          <p className="text-sm text-gray-400">
                            {completedModules.length > 0
                              ? `Resume from ${completedModules.length} completed modules`
                              : 'Start generating all modules'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                          <div className="text-sm text-gray-300">
                            <p className="font-medium text-white mb-2">Smart Recovery Enabled</p>
                            <ul className="space-y-1 text-xs text-gray-400">
                              <li>✓ Progress is saved automatically after each module</li>
                              <li>✓ Failed modules will be retried up to 3 times</li>
                              <li>✓ You can safely close the page and resume later</li>
                              <li>✓ Individual module failures won't stop the entire process</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleStartGeneration}
                        disabled={isGenerating}
                        className="btn btn-primary w-full"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            {completedModules.length > 0 ? 'Resume Generation' : 'Generate All Modules'}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* FAILED MODULES CARD */}
                  {currentBook.modules.length > 0 && failedModules.length > 0 && (
                    <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6">
                      <div className="flex items-start gap-4">
                        <AlertCircle className="w-8 h-8 text-yellow-400 shrink-0 mt-1" />
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-yellow-400 mb-2">
                            Partial Generation Issue
                          </h3>
                          <p className="text-gray-300 mb-4">
                            {failedModules.length} module(s) failed to generate.
                            You can retry just the failed modules or continue with what's available.
                          </p>
                          
                          <div className="bg-black/20 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                            <h4 className="text-sm font-semibold text-yellow-300 mb-2">Failed Modules:</h4>
                            <ul className="space-y-2">
                              {failedModules.map(module => (
                                <li key={module.id} className="flex items-start gap-2 text-sm">
                                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-medium text-gray-200">{module.title}</span>
                                    {module.error && (
                                      <p className="text-xs text-gray-400 mt-1">{module.error}</p>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="bg-green-900/20 border border-green-500/20 rounded-lg p-3 mb-4">
                            <div className="flex items-center gap-2 text-green-400">
                              <Check className="w-5 h-5" />
                              <span className="font-medium">
                                {completedModules.length} modules generated successfully
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              onClick={() => onRetryFailedModules(currentBook, {
                                goal: currentBook.goal,
                                language: currentBook.language,
                                targetAudience: formData.targetAudience,
                                complexityLevel: formData.complexityLevel,
                                preferences: formData.preferences
                              })}
                              disabled={isGenerating}
                              className="btn bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-600/30 transition-colors flex-1"
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 className="animate-spin" />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={16} />
                                  Retry Failed Modules Only
                                </>
                              )}
                            </button>
                            
                            {completedModules.length >= (currentBook.roadmap?.modules.length || 0) * 0.6 && (
                              <button
                                onClick={handleStartAssembly}
                                disabled={isGenerating}
                                className="btn btn-secondary flex-1"
                              >
                                <Box className="w-4 h-4" />
                                Continue with Available Modules
                              </button>
                            )}
                          </div>

                          <p className="text-xs text-gray-500 mt-3">
                            💡 Tip: If retries keep failing, try switching to a different AI model in the sidebar.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* NEW: ASSEMBLY CARD / SUMMARY PANEL */}
                  {areAllModulesDone && currentBook.status === 'roadmap_completed' && generationStats && (
                    <div className="bg-[var(--color-card)] border border-green-500/30 rounded-lg p-6 space-y-6 animate-fade-in-up">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 flex items-center justify-center bg-green-500/10 rounded-lg">
                            <CheckCircle className="w-7 h-7 text-green-400" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white">Generation Complete!</h3>
                            <p className="text-sm text-gray-400">All chapters have been successfully written.</p>
                          </div>
                        </div>
                        <button onClick={handleDownloadLogs} className="btn btn-secondary btn-sm">
                          <Download size={14} /> Download Logs
                        </button>
                      </div>

                      {/* Final Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)] text-center">
                          <div className="text-xs text-gray-400 mb-1">Completed</div>
                          <div className="text-2xl font-bold text-green-400 font-mono">{generationStats.completedModules}</div>
                        </div>
                        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)] text-center">
                          <div className="text-xs text-gray-400 mb-1">Failed</div>
                          <div className="text-2xl font-bold text-red-400 font-mono">{generationStats.failedModules}</div>
                        </div>
                        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)] text-center">
                          <div className="text-xs text-gray-400 mb-1">Total Words</div>
                          <div className="text-2xl font-bold text-white font-mono">{generationStats.totalWordsGenerated.toLocaleString()}</div>
                        </div>
                        <div className="bg-black/20 rounded-lg p-3 border border-[var(--color-border)] text-center">
                          <div className="text-xs text-gray-400 mb-1">Avg. Speed</div>
                          <div className="text-2xl font-bold text-purple-400 font-mono">{generationStats.wordsPerMinute.toFixed(0)} WPM</div>
                        </div>
                      </div>

                      {/* Action */}
                      <div>
                        <p className="text-center text-sm text-gray-400 mb-4">Ready to assemble the final book?</p>
                        <button onClick={handleStartAssembly} disabled={isGenerating} className="btn btn-primary w-full btn-lg">
                          <Box className="w-5 h-5" />
                          <span>Assemble Final Book</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* NEW: ASSEMBLING... PANEL */}
                  {currentBook.status === 'assembling' && (
                    <div className="bg-[var(--color-card)] border-2 rounded-lg p-8 space-y-6 animate-assembling-glow">
                      <div className="flex flex-col items-center text-center gap-4">
                        <div className="relative w-16 h-16">
                          <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
                          <div className="relative w-16 h-16 flex items-center justify-center bg-green-500/10 rounded-full">
                            <Box className="w-8 h-8 text-green-400" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">Assembling Your Book</h3>
                          <p className="text-gray-400 mt-2 max-w-md mx-auto">
                            Finalizing chapters, generating the table of contents, and preparing for download. This won't take long...
                          </p>
                        </div>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden border border-white/10">
                        <div className="h-full bg-gradient-to-r from-green-500 via-emerald-400 to-green-500 rounded-full animate-slide-in-out"></div>
                      </div>
                    </div>
                  )}

                  {/* ROADMAP SECTION */}
                  {currentBook.roadmap && (
                    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <ListChecks className="w-5 h-5 text-purple-400" />
                        <h3 className="text-xl font-bold">Learning Roadmap</h3>
                      </div>

                      <div className="space-y-4">
                        {currentBook.roadmap.modules.map((module, index) => {
                          const completedModule = currentBook.modules.find(m => m.roadmapModuleId === module.id);
                          const isActive = generationStatus?.currentModule?.id === module.id;
                          
                          return (
                            <div 
                              key={module.id}
                              className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${
                                isActive 
                                  ? 'border-blue-500/50 bg-blue-500/5 shadow-lg'
                                  : completedModule?.status === 'completed'
                                  ? 'border-green-500/30 bg-green-500/5'
                                  : completedModule?.status === 'error'
                                  ? 'border-red-500/30 bg-red-500/5'
                                  : 'border-[var(--color-border)] hover:border-gray-600'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                                completedModule?.status === 'completed'
                                  ? 'bg-green-500 text-white'
                                  : completedModule?.status === 'error'
                                  ? 'bg-red-500 text-white'
                                  : isActive
                                  ? 'bg-blue-500 text-white animate-pulse'
                                  : 'bg-[var(--color-border)] text-gray-400'
                              }`}>
                                {completedModule?.status === 'completed' ? (
                                  <Check size={16} />
                                ) : completedModule?.status === 'error' ? (
                                  <X size={16} />
                                ) : isActive ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  index + 1
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-white mb-1">{module.title}</h4>
                                <p className="text-sm text-gray-400 mb-2">
                                  {module.objectives.join(' • ')}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {module.estimatedTime}
                                  </span>
                                  {completedModule && completedModule.status === 'completed' && (
                                    <span className="text-green-400 font-medium">
                                      {completedModule.wordCount} words
                                    </span>
                                  )}
                                  {completedModule && completedModule.status === 'error' && (
                                    <span className="text-red-400 font-medium">
                                      Failed
                                    </span>
                                  )}
                                </div>
                              </div>

                              {isActive && (
                                <div className="text-blue-400 text-xs font-medium bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                                  Generating...
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ERROR CARD */}
                  {currentBook.status === 'error' && currentBook.error && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
                      <div className="flex items-start gap-4">
                        <AlertCircle className="w-8 h-8 text-red-400 shrink-0" />
                        <div>
                          <h3 className="text-xl font-bold text-red-400 mb-2">Generation Error</h3>
                          <p className="text-gray-400 mb-4">{currentBook.error}</p>
                          <p className="text-sm text-yellow-400 mb-4">Suggestion: Try switching to a different AI model in Settings, then click Retry.</p>
                          <button onClick={handleStartGeneration} disabled={isGenerating} className="btn btn-secondary">
                            {isGenerating ? <Loader2 className="animate-spin" /> : <RefreshCw size={16} />}
                            <span>{isGenerating ? 'Retrying...' : 'Retry Generation'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PREVIEW CARD */}
                  {currentBook.status === 'completed' && currentBook.finalBook && (
                    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Book Preview</h3>
                      </div>
                      <div className="bg-[var(--color-bg)] rounded-lg p-4 max-h-96 overflow-y-auto text-sm border border-[var(--color-border)]">
                        <pre className="whitespace-pre-wrap font-mono text-gray-300">
                          {currentBook.finalBook.substring(0, 2000)}...
                        </pre>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 flex items-center justify-between">
                        <span>Showing first 2000 characters. Download or use Read Mode for the full book.</span>
                        <button
                          onClick={() => setDetailTab('read')}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Read Full Book →
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
