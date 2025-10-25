// src/App.tsx (Updated - Remove GenerationProgressPanel popup)
import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/Sidebar';
import { InstallPrompt } from './components/InstallPrompt';
import { SettingsModal } from './components/SettingsModal';
import { useGenerationStats } from './components/GenerationProgressPanel';
import { APISettings, ModelProvider } from './types';
import { usePWA } from './hooks/usePWA';
import { Menu, WifiOff } from 'lucide-react';
import { storageUtils } from './utils/storage';
import { bookService } from './services/bookService';
import { BookView } from './components/BookView';
import { BookProject, BookSession } from './types/book';
import { generateId } from './utils/helpers';

type AppView = 'list' | 'create' | 'detail';

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

function App() {
  const [books, setBooks] = useState<BookProject[]>(() => storageUtils.getBooks());
  const [settings, setSettings] = useState<APISettings>(() => storageUtils.getSettings());
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [sidebarFolded, setSidebarFolded] = useState(() => 
    JSON.parse(localStorage.getItem('pustakam-sidebar-folded') || 'false')
  );
  const [view, setView] = useState<AppView>('list');
  const [showListInMain, setShowListInMain] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    status: 'idle',
    totalProgress: 0,
    totalWordsGenerated: 0,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<Date>(new Date());

  const { isInstallable, isInstalled, installApp, dismissInstallPrompt } = usePWA();

  const currentBook = currentBookId ? books.find(b => b.id === currentBookId) : null;
  const totalWordsGenerated = currentBook?.modules.reduce((sum, m) => sum + (m.status === 'completed' ? m.wordCount : 0), 0) || 0;
  const generationStats = useGenerationStats(
    currentBook?.roadmap?.totalModules || 0,
    currentBook?.modules.filter(m => m.status === 'completed').length || 0,
    currentBook?.modules.filter(m => m.status === 'error').length || 0,
    generationStartTime,
    generationStatus.totalWordsGenerated || totalWordsGenerated
  );

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      const tablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const desktop = window.innerWidth >= 1024;
      
      setIsMobile(mobile);
      
      if (desktop) {
        setSidebarOpen(true);
      } else if (mobile || tablet) {
        if (view === 'list' || view === 'create') {
          setSidebarOpen(false);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [view]);

  useEffect(() => {
    bookService.updateSettings(settings);
    
    bookService.setProgressCallback(handleBookProgressUpdate);
    
    bookService.setGenerationStatusCallback((bookId, status) => {
      setGenerationStatus(prevStatus => ({
        ...prevStatus,
        ...status,
        totalWordsGenerated: status.totalWordsGenerated || prevStatus.totalWordsGenerated,
      }));
      
      if (status.status === 'completed' || status.status === 'error') {
        setTimeout(() => {
          setIsGenerating(false);
        }, 5000);
      }
    });
  }, [settings]);

  useEffect(() => { 
    storageUtils.saveBooks(books); 
  }, [books]);

  useEffect(() => { 
    localStorage.setItem('pustakam-sidebar-folded', JSON.stringify(sidebarFolded)); 
  }, [sidebarFolded]);

  useEffect(() => {
    if (!currentBookId) {
      setView('list');
    }
  }, [currentBookId]);

  useEffect(() => {
    const handleOnline = () => { 
      setIsOnline(true); 
      setShowOfflineMessage(false); 
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineMessage(true);
      const timeout = isMobile ? 7000 : 5000;
      setTimeout(() => setShowOfflineMessage(false), timeout);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobile, sidebarOpen]);

  const hasApiKey = !!(settings.googleApiKey || settings.mistralApiKey || settings.zhipuApiKey);
  
  const handleSelectBook = (id: string | null) => {
    setCurrentBookId(id);
    if (id) {
      setView('detail');
    }
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleBookProgressUpdate = (bookId: string, updates: Partial<BookProject>) => {
    setBooks(prev => prev.map(book => 
      book.id === bookId 
        ? { ...book, ...updates, updatedAt: new Date() } 
        : book
    ));
  };
  
  const handleCreateBookRoadmap = async (session: BookSession): Promise<void> => {
    if (!hasApiKey) {
      alert('Please configure an API key in Settings first.');
      setSettingsOpen(true);
      return;
    }
    const newBook: BookProject = {
      id: generateId(),
      title: session.goal,
      goal: session.goal,
      language: session.language,
      status: 'planning',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      modules: [],
      category: 'general',
    };
    setBooks(prev => [newBook, ...prev]);
    
    try {
      await bookService.generateRoadmap(session, newBook.id);
      handleSelectBook(newBook.id); 
    } catch (error) {
      console.error("Roadmap generation failed:", error);
      handleBookProgressUpdate(newBook.id, { 
        status: 'error', 
        error: 'Failed to generate roadmap. Please check your internet connection, API key, and selected model.' 
      });
    }
  };
  
  const handleGenerateAllModules = async (book: BookProject, session: BookSession): Promise<void> => {
    if (!book.roadmap || !isOnline) {
      alert('This feature requires an internet connection.');
      return;
    }

    const hasCheckpoint = bookService.hasCheckpoint(book.id);
    const checkpointInfo = bookService.getCheckpointInfo(book.id);

    if (hasCheckpoint && checkpointInfo) {
      const message = `Found previous progress:\n\n` +
        `✓ ${checkpointInfo.completed} module(s) completed\n` +
        `✗ ${checkpointInfo.failed} module(s) failed\n\n` +
        `Do you want to:\n` +
        `• Click OK to RESUME from where you left off\n` +
        `• Click Cancel to START FRESH (will lose progress)`;

      const shouldResume = window.confirm(message);
      
      if (!shouldResume) {
        localStorage.removeItem(`checkpoint_${book.id}`);
        handleBookProgressUpdate(book.id, { 
          modules: [],
          status: 'generating_content',
          progress: 15
        });
      }
    }

    const initialWords = book.modules.reduce((sum, m) => sum + (m.status === 'completed' ? m.wordCount : 0), 0);
    setIsGenerating(true);
    setGenerationStartTime(new Date());
    setGenerationStatus({
      status: 'generating',
      totalProgress: 0,
      totalWordsGenerated: initialWords,
      logMessage: 'Initializing generation engine...'
    });

    handleBookProgressUpdate(book.id, { status: 'generating_content' });

    try {
      await bookService.generateAllModulesWithRecovery(book, session);
      
      setGenerationStatus(prev => ({
        ...prev,
        status: 'completed',
        totalProgress: 100,
        logMessage: '✓ Generation complete!'
      }));
    } catch (error) {
      console.error("Module generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      
      setGenerationStatus(prev => ({
        ...prev,
        status: 'error',
        logMessage: errorMessage
      }));
      
      handleBookProgressUpdate(book.id, { 
        status: 'error', 
        error: errorMessage
      });
    }
  };

  const handleRetryFailedModules = async (book: BookProject, session: BookSession): Promise<void> => {
    if (!isOnline) {
      alert('This feature requires an internet connection.');
      return;
    }

    const failedCount = book.modules.filter(m => m.status === 'error').length;
    
    if (failedCount === 0) {
      alert('No failed modules to retry.');
      return;
    }

    const shouldRetry = window.confirm(
      `Retry ${failedCount} failed module${failedCount > 1 ? 's' : ''}?\n\n` +
      `This will attempt to regenerate only the modules that failed.\n` +
      `Successfully generated modules will be preserved.`
    );

    if (!shouldRetry) return;

    const initialWords = book.modules.reduce((sum, m) => sum + (m.status === 'completed' ? m.wordCount : 0), 0);
    setIsGenerating(true);
    setGenerationStartTime(new Date());
    setGenerationStatus({
      status: 'generating',
      totalProgress: 0,
      totalWordsGenerated: initialWords,
      logMessage: 'Retrying failed modules...'
    });

    handleBookProgressUpdate(book.id, { status: 'generating_content' });

    try {
      await bookService.retryFailedModules(book, session);
      
      setGenerationStatus(prev => ({
        ...prev,
        status: 'completed',
        totalProgress: 100,
        logMessage: '✓ Retry complete!'
      }));
    } catch (error) {
      console.error("Retry failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Retry failed';
      
      setGenerationStatus(prev => ({
        ...prev,
        status: 'error',
        logMessage: errorMessage
      }));
      
      handleBookProgressUpdate(book.id, { 
        status: 'error', 
        error: `Retry failed: ${errorMessage}` 
      });
    }
  };

  const handleAssembleBook = async (book: BookProject, session: BookSession): Promise<void> => {
    if (!isOnline) {
      alert('This feature requires an internet connection.');
      return;
    }
    try {
      await bookService.assembleFinalBook(book, session);
    } catch (error) {
      console.error("Failed to assemble book:", error);
      handleBookProgressUpdate(book.id, { status: 'error', error: 'Final assembly failed.' });
    }
  };

  const handleDeleteBook = (id: string) => {
    const message = isMobile 
      ? 'Delete this book? This cannot be undone.' 
      : 'Are you sure you want to delete this book? This action cannot be undone.';
      
    if (window.confirm(message)) {
      setBooks(prev => prev.filter(b => b.id !== id));
      if (currentBookId === id) {
        setCurrentBookId(null);
        setShowListInMain(true);
      }
      localStorage.removeItem(`checkpoint_${id}`);
    }
  };
  
  const handleSaveSettings = (newSettings: APISettings) => { 
    setSettings(newSettings); 
    storageUtils.saveSettings(newSettings); 
    setSettingsOpen(false); 
  };

  const handleModelChange = (model: string, provider: ModelProvider) => {
    const newSettings = { ...settings, selectedModel: model, selectedProvider: provider };
    setSettings(newSettings);
    storageUtils.saveSettings(newSettings);
  };
  
  const handleInstallApp = async () => { 
    if (await installApp()) {
      console.log('App installed successfully');
    }
  };

  const handleUpdateBookContent = (bookId: string, newContent: string) => {
    setBooks(prevBooks =>
      prevBooks.map(book =>
        book.id === bookId
          ? { ...book, finalBook: newContent, updatedAt: new Date() }
          : book
      )
    );
  };

  const handleMenuClick = () => {
    setSidebarOpen(true);
  };

  const handleBackdropClick = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="app-container viewport-full prevent-overscroll">
      {sidebarOpen && !window.matchMedia('(min-width: 1024px)').matches && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={handleBackdropClick}
        />
      )}

      <Sidebar
        books={books}
        currentBookId={currentBookId}
        onSelectBook={handleSelectBook}
        onDeleteBook={handleDeleteBook}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewBook={() => {
          setView('create');
          setShowListInMain(false);
          if (isMobile) {
            setSidebarOpen(false);
          }
        }}
        onCloseSidebar={() => setSidebarOpen(false)}
        isFolded={sidebarFolded}
        onToggleFold={() => setSidebarFolded(!sidebarFolded)}
        isSidebarOpen={sidebarOpen}
        settings={settings}
        onModelChange={handleModelChange}
      />

      <div className="main-content">
        {!sidebarOpen && (
          <button 
            onClick={handleMenuClick} 
            className={`fixed z-30 btn-secondary shadow-lg transition-all duration-200 lg:hidden ${
              isMobile 
                ? 'top-4 left-4 p-3 rounded-xl' 
                : 'top-4 left-4 p-2.5 rounded-lg'
            }`}
            title="Open sidebar"
            style={{
              top: isMobile ? 'max(16px, env(safe-area-inset-top))' : '16px'
            }}
          >
            <Menu className={`${isMobile ? 'w-6 h-6' : 'w-5 h-5'}`} />
          </button>
        )}

        {showOfflineMessage && (
          <div 
            className={`fixed z-50 content-card animate-fade-in-up ${
              isMobile 
                ? 'top-20 left-4 right-4 p-4'
                : 'top-4 right-4 p-3'
            }`}
            style={{
              top: isMobile ? 'max(80px, calc(env(safe-area-inset-top) + 64px))' : '16px'
            }}
          >
            <div className="flex items-center gap-2 text-yellow-400">
              <WifiOff className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
              <span className={`font-medium ${isMobile ? 'text-base' : 'text-sm'}`}>
                You're offline
              </span>
            </div>
          </div>
        )}

        <BookView
          books={books}
          currentBookId={currentBookId}
          onCreateBookRoadmap={handleCreateBookRoadmap}
          onGenerateAllModules={handleGenerateAllModules}
          onRetryFailedModules={handleRetryFailedModules}
          onAssembleBook={handleAssembleBook}
          onSelectBook={handleSelectBook}
          onDeleteBook={handleDeleteBook}
          hasApiKey={hasApiKey}
          view={view}
          setView={setView}
          onUpdateBookContent={handleUpdateBookContent}
          showListInMain={showListInMain}
          setShowListInMain={setShowListInMain}
          isMobile={isMobile}
          generationStatus={generationStatus}
          generationStats={generationStats}
        />
      </div>

      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
        settings={settings} 
        onSaveSettings={handleSaveSettings}
      />

      {isInstallable && !isInstalled && (
        <InstallPrompt 
          onInstall={handleInstallApp} 
          onDismiss={dismissInstallPrompt}
        />
      )}

      <Analytics />
    </div>
  );
}

export default App;
