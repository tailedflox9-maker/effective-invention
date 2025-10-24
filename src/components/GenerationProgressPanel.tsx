import React, { useState, useEffect, useRef } from 'react';
import { 
  Loader2, Check, X, AlertTriangle, Zap, Clock, 
  Activity, TrendingUp, RefreshCw, Pause, Play,
  Cpu, Server, Database, Terminal, Code, FileText,
  Sparkles, ChevronDown, ChevronUp, Minimize2
} from 'lucide-react';

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
  message?: string;
}

interface GenerationStats {
  startTime: Date;
  totalModules: number;
  completedModules: number;
  failedModules: number;
  averageTimePerModule: number;
  estimatedTimeRemaining: number;
}

interface GenerationProgressPanelProps {
  bookId: string;
  generationStatus: GenerationStatus;
  stats: GenerationStats;
  onPause?: () => void;
  onCancel?: () => void;
  isPausable?: boolean;
}

export default function GenerationProgressPanel({
  bookId,
  generationStatus,
  stats,
  onPause,
  onCancel,
  isPausable = false
}: GenerationProgressPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showLiveText, setShowLiveText] = useState(true);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Auto-scroll to bottom for live text
  useEffect(() => {
    if (textContainerRef.current && showLiveText) {
      textContainerRef.current.scrollTop = textContainerRef.current.scrollHeight;
    }
  }, [generationStatus.currentModule?.generatedText, showLiveText]);

  // Update elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - stats.startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.startTime]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  const getStatusColor = () => {
    switch (generationStatus.status) {
      case 'generating': return 'border-blue-500 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-blue-500/5';
      case 'completed': return 'border-green-500 bg-gradient-to-br from-green-500/5 via-emerald-500/5 to-green-500/5';
      case 'error': return 'border-red-500 bg-gradient-to-br from-red-500/5 via-orange-500/5 to-red-500/5';
      default: return 'border-gray-500 bg-gray-500/5';
    }
  };

  const getStatusIcon = () => {
    switch (generationStatus.status) {
      case 'generating': 
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'completed': 
        return <Check className="w-5 h-5 text-green-400" />;
      case 'error': 
        return <X className="w-5 h-5 text-red-400" />;
      default: 
        return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  const progressPercentage = generationStatus.currentModule?.progress || 0;
  const overallProgress = (stats.completedModules / stats.totalModules) * 100;
  const successRate = stats.completedModules + stats.failedModules > 0 
    ? (stats.completedModules / (stats.completedModules + stats.failedModules)) * 100 
    : 100;

  // Calculate tokens per second (rough estimate: ~1 word = 1.3 tokens)
  const estimatedTokens = generationStatus.currentModule?.generatedText 
    ? generationStatus.currentModule.generatedText.split(/\s+/).length * 1.3 
    : 0;
  const tokensPerSecond = elapsedTime > 0 ? (estimatedTokens / elapsedTime).toFixed(1) : '0.0';

  return (
    <div 
      className={`fixed bottom-6 right-6 w-[520px] max-w-[calc(100vw-48px)] rounded-2xl border-2 shadow-2xl backdrop-blur-xl transition-all duration-300 ${getStatusColor()} ${
        isExpanded ? 'max-h-[680px]' : 'max-h-[140px]'
      }`}
      style={{
        background: 'linear-gradient(135deg, rgba(10, 10, 10, 0.98) 0%, rgba(20, 20, 20, 0.98) 100%)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Animated background effect */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
            animation: 'pulse 3s ease-in-out infinite'
          }}
        />
      </div>

      {/* Progress indicator bar at top */}
      <div 
        className="absolute top-0 left-0 h-1 rounded-t-2xl transition-all duration-500 ease-out"
        style={{ 
          width: `${overallProgress}%`,
          background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)'
        }}
      />

      {/* Header */}
      <div className="p-5 border-b border-white/10 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative">
              {getStatusIcon()}
              {generationStatus.status === 'generating' && (
                <div className="absolute inset-0 animate-ping">
                  <Activity className="w-5 h-5 text-blue-400 opacity-50" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                {generationStatus.status === 'generating' ? (
                  <>
                    <Terminal className="w-4 h-4 text-blue-400" />
                    AI Generation Active
                  </>
                ) : generationStatus.status === 'completed' ? (
                  <>
                    <Sparkles className="w-4 h-4 text-green-400" />
                    Generation Complete
                  </>
                ) : generationStatus.status === 'error' ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    Error Encountered
                  </>
                ) : (
                  'Preparing...'
                )}
              </h3>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs text-gray-400 font-mono">
                  Module {stats.completedModules + 1}/{stats.totalModules}
                </p>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{formatTime(elapsedTime)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isPausable && generationStatus.status === 'generating' && (
              <button
                onClick={onPause}
                className="p-2 hover:bg-white/5 rounded-lg transition-all duration-200 group"
                title="Pause generation"
              >
                <Pause className="w-4 h-4 text-gray-400 group-hover:text-white" />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-white/5 rounded-lg transition-all duration-200 group"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-white" />
              )}
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-all duration-200 group"
                title="Cancel generation"
              >
                <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400 font-semibold">Overall Progress</span>
            <span className="text-blue-400 font-bold font-mono">{Math.round(overallProgress)}%</span>
          </div>
          <div className="relative w-full bg-black/40 rounded-full h-2.5 overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out relative"
              style={{ 
                width: `${overallProgress}%`,
                background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)'
              }}
            >
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                style={{ animation: 'shimmer 2s infinite' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-5 space-y-4 max-h-[480px] overflow-y-auto relative z-10">
          {/* Current Module Progress */}
          {generationStatus.currentModule && (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {generationStatus.status === 'generating' ? (
                      <Code className="w-4 h-4 text-blue-400 animate-pulse" />
                    ) : generationStatus.status === 'error' ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    ) : (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                    <h4 className="font-semibold text-sm text-white line-clamp-1">
                      {generationStatus.currentModule.title}
                    </h4>
                  </div>
                  
                  {generationStatus.currentModule.attempt > 1 && (
                    <div className="flex items-center gap-2 text-xs text-yellow-400 mb-2 bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/20">
                      <RefreshCw className="w-3 h-3" />
                      <span className="font-mono">Retry {generationStatus.currentModule.attempt}/5</span>
                    </div>
                  )}

                  {/* Module Progress Bar */}
                  <div className="relative w-full bg-black/40 rounded-full h-2 overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 relative"
                      style={{ width: `${progressPercentage}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-400 ml-3 font-mono font-bold">
                  {Math.round(progressPercentage)}%
                </span>
              </div>

              {/* Live Generation Metrics */}
              {generationStatus.status === 'generating' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/40 rounded-lg p-2 border border-blue-500/20">
                    <div className="flex items-center gap-1 mb-1">
                      <Zap className="w-3 h-3 text-blue-400" />
                      <span className="text-xs text-gray-400">Tokens/s</span>
                    </div>
                    <p className="text-sm font-bold text-blue-400 font-mono">{tokensPerSecond}</p>
                  </div>
                  
                  <div className="bg-black/40 rounded-lg p-2 border border-purple-500/20">
                    <div className="flex items-center gap-1 mb-1">
                      <FileText className="w-3 h-3 text-purple-400" />
                      <span className="text-xs text-gray-400">Words</span>
                    </div>
                    <p className="text-sm font-bold text-purple-400 font-mono">
                      {generationStatus.currentModule?.generatedText?.split(/\s+/).length || 0}
                    </p>
                  </div>
                  
                  <div className="bg-black/40 rounded-lg p-2 border border-green-500/20">
                    <div className="flex items-center gap-1 mb-1">
                      <Activity className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-gray-400">Success</span>
                    </div>
                    <p className="text-sm font-bold text-green-400 font-mono">{Math.round(successRate)}%</p>
                  </div>
                </div>
              )}

              {/* Live Text Preview */}
              {generationStatus.currentModule?.generatedText && showLiveText && (
                <div className="bg-black/50 rounded-lg border border-blue-500/20 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-black/40 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3 h-3 text-blue-400" />
                      <span className="text-xs text-gray-400 font-semibold">Live Stream</span>
                    </div>
                    <button
                      onClick={() => setShowLiveText(!showLiveText)}
                      className="text-xs text-gray-500 hover:text-white transition-colors"
                    >
                      {showLiveText ? <Minimize2 className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                  <div 
                    ref={textContainerRef}
                    className="p-3 max-h-[160px] overflow-y-auto"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(59, 130, 246, 0.3) transparent'
                    }}
                  >
                    <p className="text-xs text-gray-300 leading-relaxed font-mono whitespace-pre-wrap">
                      {generationStatus.currentModule.generatedText}
                      <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-1"></span>
                    </p>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {generationStatus.message && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-xs text-blue-300 font-medium">{generationStatus.message}</p>
                </div>
              )}
            </div>
          )}

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/40 rounded-lg p-3 border border-green-500/20 hover:border-green-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400 font-semibold">Completed</span>
              </div>
              <p className="text-2xl font-bold text-green-400 font-mono">{stats.completedModules}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.totalModules > 0 ? `${Math.round((stats.completedModules / stats.totalModules) * 100)}%` : '0%'}
              </p>
            </div>

            <div className="bg-black/40 rounded-lg p-3 border border-red-500/20 hover:border-red-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <X className="w-4 h-4 text-red-400" />
                <span className="text-xs text-gray-400 font-semibold">Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-400 font-mono">{stats.failedModules}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.failedModules > 0 ? 'Will retry' : 'All good'}
              </p>
            </div>

            <div className="bg-black/40 rounded-lg p-3 border border-blue-500/20 hover:border-blue-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400 font-semibold">Avg Time</span>
              </div>
              <p className="text-2xl font-bold text-blue-400 font-mono">
                {stats.averageTimePerModule > 0 ? formatTime(Math.round(stats.averageTimePerModule)) : '--'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Per module</p>
            </div>

            <div className="bg-black/40 rounded-lg p-3 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400 font-semibold">ETA</span>
              </div>
              <p className="text-2xl font-bold text-purple-400 font-mono">
                {stats.estimatedTimeRemaining > 0 ? formatTime(Math.round(stats.estimatedTimeRemaining)) : '--'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Remaining</p>
            </div>
          </div>

          {/* System Info */}
          <div className="bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 border border-white/10 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-gray-300 space-y-1">
                <p className="font-semibold text-white">💡 Smart Recovery Active</p>
                <ul className="text-gray-400 space-y-0.5 ml-2">
                  <li>✓ Progress auto-saved after each module</li>
                  <li>✓ Failed modules retry up to 5 times</li>
                  <li>✓ Safe to close - resume anytime</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
