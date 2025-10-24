// src/components/GenerationProgressPanel.tsx - Real-time Generation UI
import React, { useState, useEffect, useRef } from 'react';
import { 
  Loader2, Check, X, AlertTriangle, Zap, Clock, 
  Activity, TrendingUp, RefreshCw, Pause
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

export function GenerationProgressPanel({
  bookId,
  generationStatus,
  stats,
  onPause,
  onCancel,
  isPausable = false
}: GenerationProgressPanelProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Animate text appearance
  useEffect(() => {
    if (generationStatus.currentModule?.generatedText) {
      const targetText = generationStatus.currentModule.generatedText;
      let currentIndex = 0;
      
      const interval = setInterval(() => {
        if (currentIndex < targetText.length) {
          setDisplayedText(targetText.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(interval);
        }
      }, 10); // Fast typing effect

      return () => clearInterval(interval);
    }
  }, [generationStatus.currentModule?.generatedText]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = textContainerRef.current.scrollHeight;
    }
  }, [displayedText]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getStatusColor = () => {
    switch (generationStatus.status) {
      case 'generating': return 'border-blue-500 bg-blue-500/10';
      case 'completed': return 'border-green-500 bg-green-500/10';
      case 'error': return 'border-red-500 bg-red-500/10';
      default: return 'border-gray-500 bg-gray-500/10';
    }
  };

  const getStatusIcon = () => {
    switch (generationStatus.status) {
      case 'generating': 
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed': 
        return <Check className="w-5 h-5 text-green-500" />;
      case 'error': 
        return <X className="w-5 h-5 text-red-500" />;
      default: 
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const progressPercentage = generationStatus.currentModule?.progress || 0;
  const overallProgress = (stats.completedModules / stats.totalModules) * 100;

  return (
    <div className={`fixed bottom-6 right-6 w-[500px] max-w-[calc(100vw-48px)] rounded-2xl border-2 shadow-2xl backdrop-blur-xl transition-all duration-300 ${getStatusColor()} ${
      isExpanded ? 'max-h-[600px]' : 'max-h-[120px]'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <h3 className="font-semibold text-white">
                {generationStatus.status === 'generating' ? 'Generating Book' : 
                 generationStatus.status === 'completed' ? 'Generation Complete' : 
                 generationStatus.status === 'error' ? 'Generation Error' : 
                 'Preparing...'}
              </h3>
              <p className="text-xs text-gray-400">
                Module {stats.completedModules + 1} of {stats.totalModules}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isPausable && generationStatus.status === 'generating' && (
              <button
                onClick={onPause}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Pause generation"
              >
                <Pause className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              <TrendingUp className={`w-4 h-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                title="Cancel generation"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Overall Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative"
              style={{ width: `${overallProgress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 max-h-[440px] overflow-y-auto">
          {/* Current Module Progress */}
          {generationStatus.currentModule && (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {generationStatus.status === 'generating' ? (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : generationStatus.status === 'error' ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    ) : (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                    <h4 className="font-medium text-sm text-white">
                      {generationStatus.currentModule.title}
                    </h4>
                  </div>
                  
                  {generationStatus.currentModule.attempt > 1 && (
                    <div className="flex items-center gap-1 text-xs text-yellow-400 mb-2">
                      <RefreshCw className="w-3 h-3" />
                      <span>Retry attempt {generationStatus.currentModule.attempt}/5</span>
                    </div>
                  )}

                  {/* Module Progress Bar */}
                  <div className="w-full bg-black/30 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                  </div>
                </div>
                <span className="text-xs text-gray-400 ml-3">{Math.round(progressPercentage)}%</span>
              </div>

              {/* Live Generated Text Preview */}
              {displayedText && (
                <div 
                  ref={textContainerRef}
                  className="bg-black/40 rounded-lg p-3 max-h-[200px] overflow-y-auto border border-white/5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs text-gray-400 font-medium">Live Preview</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed font-mono">
                    {displayedText}
                    <span className="inline-block w-1 h-3 bg-blue-400 animate-pulse ml-1"></span>
                  </p>
                </div>
              )}

              {/* Status Message */}
              {generationStatus.message && (
                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                  <p className="text-xs text-gray-300">{generationStatus.message}</p>
                </div>
              )}
            </div>
          )}

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400">Completed</span>
              </div>
              <p className="text-lg font-bold text-white">{stats.completedModules}</p>
            </div>

            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <X className="w-4 h-4 text-red-400" />
                <span className="text-xs text-gray-400">Failed</span>
              </div>
              <p className="text-lg font-bold text-white">{stats.failedModules}</p>
            </div>

            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400">Avg Time</span>
              </div>
              <p className="text-lg font-bold text-white">
                {stats.averageTimePerModule > 0 ? formatTime(stats.averageTimePerModule) : '--'}
              </p>
            </div>

            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400">Est. Remaining</span>
              </div>
              <p className="text-lg font-bold text-white">
                {stats.estimatedTimeRemaining > 0 ? formatTime(stats.estimatedTimeRemaining) : '--'}
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-xs text-blue-300">
              💡 <strong>Tip:</strong> Generation progress is saved automatically. You can safely close this page and come back later!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Export a hook to manage generation stats
export function useGenerationStats(
  totalModules: number,
  completedModules: number,
  failedModules: number,
  startTime: Date
): GenerationStats {
  const [stats, setStats] = React.useState<GenerationStats>({
    startTime,
    totalModules,
    completedModules,
    failedModules,
    averageTimePerModule: 0,
    estimatedTimeRemaining: 0
  });

  React.useEffect(() => {
    const elapsed = (Date.now() - startTime.getTime()) / 1000;
    const avgTime = completedModules > 0 ? elapsed / completedModules : 0;
    const remaining = totalModules - completedModules;
    const estimatedRemaining = avgTime * remaining;

    setStats({
      startTime,
      totalModules,
      completedModules,
      failedModules,
      averageTimePerModule: avgTime,
      estimatedTimeRemaining: estimatedRemaining
    });
  }, [totalModules, completedModules, failedModules, startTime]);

  return stats;
}
