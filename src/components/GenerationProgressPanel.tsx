// src/components/GenerationProgressPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
    Loader2, Check, X, AlertTriangle, Zap, Clock,
    Activity, TrendingUp, RefreshCw, XCircle, FileText, Brain, Gauge, Download, Terminal, Eye, EyeOff
} from 'lucide-react';

// Interfaces for props and state
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

interface GenerationProgressPanelProps {
    generationStatus: GenerationStatus;
    stats: GenerationStats;
    onCancel?: () => void;
}

interface LogEntry {
    id: number;
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'warn' | 'error';
    data?: any;
}

// Sub-component for displaying individual stats
const StatCard = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string | number }) => (
    <div className="bg-black/30 rounded-lg p-3 border border-white/5 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-md">
            <Icon className="w-5 h-5 text-gray-400" />
        </div>
        <div>
            <div className="text-xs text-gray-400">{label}</div>
            <div className="text-lg font-semibold text-white font-mono">{value}</div>
        </div>
    </div>
);

// The main component
export function GenerationProgressPanel({ generationStatus, stats, onCancel }: GenerationProgressPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [eventLog, setEventLog] = useState<LogEntry[]>([]);
    const [typedText, setTypedText] = useState('');
    const [showLiveFeed, setShowLiveFeed] = useState(true);
    const [showEventLog, setShowEventLog] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const liveFeedRef = useRef<HTMLDivElement>(null);

    // Download logs function
    const downloadLogs = () => {
        const logsContent = [
            '='.repeat(80),
            'PUSTAKAM AI BOOK GENERATION - DETAILED LOG',
            '='.repeat(80),
            `Generated: ${new Date().toLocaleString()}`,
            `Session Start: ${stats.startTime.toLocaleString()}`,
            `Total Modules: ${stats.totalModules}`,
            `Completed: ${stats.completedModules} | Failed: ${stats.failedModules}`,
            `Total Words Generated: ${stats.totalWordsGenerated.toLocaleString()}`,
            `Average Speed: ${stats.wordsPerMinute.toFixed(0)} words/minute`,
            '='.repeat(80),
            '',
            ...eventLog.map(log => 
                `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}${log.data ? `\n   Data: ${JSON.stringify(log.data, null, 2)}` : ''}`
            ).reverse()
        ].join('\n');

        const blob = new Blob([logsContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pustakam-generation-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Effect for the typewriter animation
    useEffect(() => {
        const fullText = generationStatus.currentModule?.generatedText || '';
        if (fullText === typedText) return;

        let i = typedText.length;
        if (i > fullText.length) {
             i = 0;
             setTypedText('');
        }

        const timer = setInterval(() => {
            if (i < fullText.length) {
                setTypedText(prev => prev + fullText[i]);
                i++;
                
                // Auto-scroll live feed
                if (liveFeedRef.current && showLiveFeed) {
                    liveFeedRef.current.scrollTop = liveFeedRef.current.scrollHeight;
                }
            } else {
                clearInterval(timer);
            }
        }, 10);

        return () => clearInterval(timer);
    }, [generationStatus.currentModule?.generatedText, showLiveFeed]);

    // Reset typed text for new module
    useEffect(() => {
        setTypedText('');
    }, [generationStatus.currentModule?.id]);

    // Update event log when a new log message arrives
    useEffect(() => {
        if (generationStatus.logMessage) {
            const newEntry: LogEntry = {
                id: Date.now(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                message: generationStatus.logMessage,
                type: generationStatus.logMessage.includes('✓') ? 'success' : 
                      generationStatus.logMessage.includes('⚠️') ? 'warn' : 
                      generationStatus.logMessage.includes('✗') ? 'error' : 'info',
                data: generationStatus.currentModule ? {
                    moduleId: generationStatus.currentModule.id,
                    moduleTitle: generationStatus.currentModule.title,
                    attempt: generationStatus.currentModule.attempt,
                    totalWords: generationStatus.totalWordsGenerated
                } : undefined
            };
            setEventLog(prev => [newEntry, ...prev.slice(0, 99)]); // Keep last 100 logs
        }
    }, [generationStatus.logMessage]);

    // Auto-scroll event log
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [eventLog]);

    const getStatusInfo = () => {
        switch (generationStatus.status) {
            case 'generating': return { color: 'border-blue-500', icon: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />, title: 'Generation In Progress' };
            case 'completed': return { color: 'border-green-500', icon: <Check className="w-5 h-5 text-green-400" />, title: 'Generation Complete' };
            case 'error': return { color: 'border-red-500', icon: <X className="w-5 h-5 text-red-400" />, title: 'Generation Error' };
            default: return { color: 'border-gray-500', icon: <Brain className="w-5 h-5 text-gray-500" />, title: 'Initializing...' };
        }
    };
    const { color, icon, title } = getStatusInfo();
    const overallProgress = (stats.completedModules / (stats.totalModules || 1)) * 100;

    return (
        <div className={`fixed bottom-6 right-6 w-[550px] max-w-[calc(100vw-3rem)] rounded-2xl border-2 shadow-2xl backdrop-blur-xl bg-black/50 transition-all duration-300 ${color} overflow-hidden z-50`}>
            <div className="relative z-10">
                {/* Header */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {icon}
                            <div>
                                <h3 className="font-semibold text-white">{title}</h3>
                                <p className="text-xs text-gray-400">
                                    Module {stats.completedModules + 1} of {stats.totalModules}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={isExpanded ? 'Minimize' : 'Expand'}>
                                <TrendingUp className={`w-4 h-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
                            </button>
                            {onCancel && (
                                <button onClick={onCancel} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors" title="Cancel generation">
                                    <XCircle className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>Overall Progress</span>
                            <span>{Math.round(overallProgress)}%</span>
                        </div>
                        <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden border border-white/5">
                            <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500" style={{ width: `${overallProgress}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <div className="p-4 space-y-4 max-h-[calc(80vh-120px)] overflow-y-auto">
                        {/* Current Module Progress */}
                        {generationStatus.currentModule && (
                            <div className="bg-black/30 p-4 rounded-lg border border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-sm text-white truncate pr-4">{generationStatus.currentModule.title}</h4>
                                    <div className="flex items-center gap-2">
                                        {generationStatus.currentModule.attempt > 1 && (
                                            <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-md">
                                                <RefreshCw className="w-3 h-3" />
                                                <span>Attempt {generationStatus.currentModule.attempt}</span>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setShowLiveFeed(!showLiveFeed)}
                                            className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                                            title={showLiveFeed ? 'Hide live feed' : 'Show live feed'}
                                        >
                                            {showLiveFeed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                
                                {showLiveFeed && typedText && (
                                    <div 
                                        ref={liveFeedRef}
                                        className="bg-black/40 rounded-lg p-3 max-h-[200px] overflow-y-auto border border-white/5 text-xs text-gray-300 leading-relaxed font-mono"
                                    >
                                        <div className="flex items-start gap-2 mb-2 pb-2 border-b border-white/10">
                                            <Zap className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
                                            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Live AI Stream</span>
                                        </div>
                                        <div className="whitespace-pre-wrap">
                                            {typedText}
                                            <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-1"></span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Statistics Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <StatCard icon={Check} label="Completed" value={stats.completedModules} />
                            <StatCard icon={X} label="Failed" value={stats.failedModules} />
                            <StatCard icon={FileText} label="Total Words" value={stats.totalWordsGenerated.toLocaleString()} />
                            <StatCard icon={Gauge} label="WPM" value={stats.wordsPerMinute.toFixed(0)} />
                            <StatCard icon={Clock} label="Avg Time / Module" value={formatTime(stats.averageTimePerModule)} />
                            <StatCard icon={Activity} label="Est. Remaining" value={formatTime(stats.estimatedTimeRemaining)} />
                        </div>

                        {/* Event Log */}
                        <div className="bg-black/30 p-3 rounded-lg border border-white/5">
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
                                        onClick={downloadLogs}
                                        className="p-1 hover:bg-white/10 rounded transition-colors"
                                        title="Download full log"
                                    >
                                        <Download className="w-3 h-3 text-blue-400" />
                                    </button>
                                </div>
                            </div>
                            
                            {showEventLog && (
                                <div ref={logContainerRef} className="max-h-[180px] overflow-y-auto space-y-2 text-xs font-mono">
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
                            
                            {!showEventLog && (
                                <div className="text-xs text-gray-500">
                                    {eventLog.length} events logged • Click to expand
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Utility functions
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 1) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
};

// Hook to manage stats
export function useGenerationStats(
    totalModules: number,
    completedModules: number,
    failedModules: number,
    startTime: Date,
    totalWordsGenerated: number
): GenerationStats {
    const [stats, setStats] = React.useState<GenerationStats>({
        startTime, totalModules, completedModules, failedModules,
        averageTimePerModule: 0, estimatedTimeRemaining: 0,
        totalWordsGenerated, wordsPerMinute: 0
    });

    React.useEffect(() => {
        const elapsedSeconds = (Date.now() - startTime.getTime()) / 1000;
        const avgTime = completedModules > 0 ? elapsedSeconds / completedModules : 0;
        const remaining = totalModules - completedModules;
        const estimatedRemaining = avgTime * remaining;
        const wpm = elapsedSeconds > 0 ? (totalWordsGenerated / elapsedSeconds) * 60 : 0;

        setStats({
            startTime, totalModules, completedModules, failedModules,
            averageTimePerModule: avgTime,
            estimatedTimeRemaining: estimatedRemaining,
            totalWordsGenerated,
            wordsPerMinute: wpm
        });
    }, [totalModules, completedModules, failedModules, startTime, totalWordsGenerated]);

    return stats;
}
