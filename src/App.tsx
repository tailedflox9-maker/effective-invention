// src/App.tsx (Mobile-Responsive Enhanced)
import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/Sidebar';
import { InstallPrompt } from './components/InstallPrompt';
import { SettingsModal } from './components/SettingsModal';
import { APISettings, ModelProvider } from './types';
import { usePWA } from './hooks/usePWA';
import { Menu, WifiOff } from 'lucide-react';
import { storageUtils } from './utils/storage';
import { bookService } from './services/bookService';
import { BookView } from './components/BookView';
import { BookProject, BookSession } from './types/book';
import { generateId } from './utils/helpers';

type AppView = 'list' | 'create' | 'detail';

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

  const { isInstallable, isInstalled, installApp, dismissInstallPrompt } = usePWA();
  
  // Enhanced responsive detection
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      const tablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const desktop = window.innerWidth >= 1024;
      
      setIsMobile(mobile);
      
      // Auto-open sidebar on desktop, auto-close on mobile/tablet
      if (desktop) {
        setSidebarOpen(true);
      } else if (mobile || tablet) {
        // Close sidebar when switching to mobile/tablet unless user is actively browsing
        if (view === 'list' || view === 'create') {
          setSidebarOpen(false);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    // Listen for orientation changes on mobile
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

  // Enhanced offline detection with better mobile handling
  useEffect(() => {
    const handleOnline = () => { 
      setIsOnline(true); 
      setShowOfflineMessage(false); 
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineMessage(true);
      // Show offline message longer on mobile
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

  // Prevent scrolling when sidebar is open on mobile
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

  const hasApiKey = !!(settings.googleApiKey || settings.mistralApiKey);
  
  const handleSelectBook = (id: string | null) => {
    setCurrentBookId(id);
    if (id) {
      setView('detail');
    }
    // Always close sidebar on mobile when selecting a book
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
    bookService.setProgressCallback(handleBookProgressUpdate);
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
    handleBookProgressUpdate(book.id, { status: 'generating_content' });
    const modulesToGenerate = book.roadmap.modules.filter(roadmapModule => 
      !book.modules.find(m => m.roadmapModuleId === roadmapModule.id && m.status === 'completed')
    );
    let completedModules = [...book.modules];
    for (let i = 0; i < modulesToGenerate.length; i++) {
      const roadmapModule = modulesToGenerate[i];
      try {
        const newModule = await bookService.generateModuleContent({ ...book, modules: completedModules }, roadmapModule, session);
        completedModules.push(newModule);
        const currentProgress = 10 + ((i + 1) / book.roadmap.modules.length) * 80;
        handleBookProgressUpdate(book.id, { modules: [...completedModules], progress: currentProgress });
      } catch (error) {
        console.error(`Failed to generate module ${roadmapModule.title}`, error);
        handleBookProgressUpdate(book.id, { status: 'error', error: `Failed on module: ${roadmapModule.title}.` });
        return;
      }
    }
    handleBookProgressUpdate(book.id, { status: 'roadmap_completed' });
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

  // Close sidebar when clicking outside on mobile
  const handleBackdropClick = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="app-container viewport-full prevent-overscroll">
      {/* Mobile/Tablet sidebar backdrop */}
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
          // Close sidebar on mobile after action
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
        isMobile={isMobile}
      />

      <div className="main-content">
        {/* Enhanced mobile menu button with better positioning */}
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

        {/* Enhanced offline message with mobile optimization */}
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
        />
      </div>

      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
        settings={settings} 
        onSaveSettings={handleSaveSettings}
        isMobile={isMobile}
      />

      {/* Enhanced install prompt with mobile optimization */}
      {isInstallable && !isInstalled && (
        <InstallPrompt 
          onInstall={handleInstallApp} 
          onDismiss={dismissInstallPrompt}
          isMobile={isMobile}
        />
      )}

      {/* Vercel Analytics Component */}
      <Analytics />
    </div>
  );
}

export default App;
