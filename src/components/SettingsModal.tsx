// src/components/SettingsModal.tsx
import React from 'react';
import { X, Shield, Database, Download, Upload, Trash2, HelpCircle, Key, Settings, ExternalLink, Eye, EyeOff, User, Zap, Globe, Cpu, BookOpen, AlertTriangle, Plus } from 'lucide-react';
import { APISettings } from '../types';
import { storageUtils } from '../utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: APISettings;
  onSaveSettings: (settings: APISettings) => void;
}

type ActiveTab = 'keys' | 'data' | 'about';

interface ImportPreview {
  books: any[];
  settings: APISettings;
  conflicts: {
    duplicateBooks: number;
    settingsConflict: boolean;
  };
}

export function SettingsModal({ isOpen, onClose, settings, onSaveSettings }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = React.useState<APISettings>(settings);
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('keys');
  const [visibleApis, setVisibleApis] = React.useState<Record<string, boolean>>({});
  const [importPreview, setImportPreview] = React.useState<ImportPreview | null>(null);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setLocalSettings(settings), [settings, isOpen]);

  const handleSave = () => { onSaveSettings(localSettings); onClose(); };

  const handleExportData = () => {
    const data = { 
      books: storageUtils.getBooks(), 
      settings: storageUtils.getSettings(),
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pustakam-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImportPreview = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        const existingBooks = storageUtils.getBooks();
        const existingSettings = storageUtils.getSettings();
        
        // Analyze conflicts
        const duplicateBooks = importData.books ? 
          importData.books.filter((importBook: any) => 
            existingBooks.some(existingBook => existingBook.id === importBook.id)
          ).length : 0;
        
        const settingsConflict = importData.settings && 
          JSON.stringify(existingSettings) !== JSON.stringify(importData.settings);

        setImportPreview({
          books: importData.books || [],
          settings: importData.settings || existingSettings,
          conflicts: {
            duplicateBooks,
            settingsConflict
          }
        });
        setShowImportModal(true);
      } catch (error) {
        alert('Failed to read import file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const executeImport = (mode: 'merge' | 'replace') => {
    if (!importPreview) return;
    
    try {
      if (mode === 'replace') {
        // Replace all data
        storageUtils.saveBooks(importPreview.books);
        if (importPreview.settings) {
          setLocalSettings(importPreview.settings);
          storageUtils.saveSettings(importPreview.settings);
        }
      } else {
        // Merge data intelligently
        const existingBooks = storageUtils.getBooks();
        const existingSettings = storageUtils.getSettings();
        
        // Merge books (skip duplicates, add new ones)
        const mergedBooks = [...existingBooks];
        importPreview.books.forEach(importBook => {
          const exists = mergedBooks.some(existing => existing.id === importBook.id);
          if (!exists) {
            mergedBooks.push(importBook);
          }
        });
        storageUtils.saveBooks(mergedBooks);
        
        // Merge settings (keep existing API keys if they exist, add new ones)
        const mergedSettings = { ...importPreview.settings };
        Object.keys(existingSettings).forEach(key => {
          if (existingSettings[key as keyof APISettings] && 
              key.includes('ApiKey') && 
              existingSettings[key as keyof APISettings] !== '') {
            mergedSettings[key as keyof APISettings] = existingSettings[key as keyof APISettings];
          }
        });
        setLocalSettings(mergedSettings);
        storageUtils.saveSettings(mergedSettings);
      }
      
      setShowImportModal(false);
      setImportPreview(null);
      alert(`Data imported successfully using ${mode} mode! The app will now reload.`);
      window.location.reload();
    } catch (error) {
      console.error('Import failed:', error);
      let message = 'Failed to import data. Please check the file and try again.';
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        message = 'Import failed: Your browser storage is full. Please clear some space and try again.';
      }
      alert(message);
    }
  };

  const handleClearData = () => {
    if (window.confirm('This will permanently delete all books and settings. This action cannot be undone. Are you sure?')) {
      storageUtils.clearAllData();
      alert('All data has been cleared. The app will now reload.');
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  const TabButton = ({ id, label, Icon }: { id: ActiveTab; label: string; Icon: React.ElementType; }) => (
    <button onClick={() => setActiveTab(id)} className={`flex-1 flex items-center justify-center gap-2 p-3 text-sm font-semibold transition-colors rounded-lg ${activeTab === id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
      <Icon size={16} />{label}
    </button>
  );

  // API configuration with proper URLs and names
  const apiConfigs = [
    {
      id: 'googleApiKey' as keyof APISettings,
      name: 'Google AI',
      url: 'https://aistudio.google.com/app/apikey',
      description: 'For Gemini models (recommended for most users)'
    },
    {
      id: 'mistralApiKey' as keyof APISettings,
      name: 'Mistral AI',
      url: 'https://console.mistral.ai/api-keys',
      description: 'For Mistral and Mixtral models'
    },
    {
      id: 'zhipuApiKey' as keyof APISettings,
      name: 'ZhipuAI',
      url: 'https://open.bigmodel.cn/usercenter/apikeys',
      description: 'For GLM models (Chinese AI provider)'
    }
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
        <div className="relative w-full max-w-lg bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-fade-in-up" onClick={e => e.stopPropagation()}>
          <div className="p-5 flex items-center justify-between border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3"><Settings size={20} /><h2 className="text-xl font-bold">Settings</h2></div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors"><X size={18} /></button>
          </div>

          <div className="p-2 grid grid-cols-3 gap-2 border-b border-[var(--color-border)]">
            <TabButton id="keys" label="API Keys" Icon={Shield} />
            <TabButton id="data" label="Data" Icon={Database} />
            <TabButton id="about" label="About" Icon={HelpCircle} />
          </div>

          <div className="p-6 overflow-y-auto min-h-[25rem]">
            {activeTab === 'keys' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">API Keys</h3>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <p className="text-sm text-blue-300 mb-2">
                      🔒 Your API keys are stored locally in your browser and are never sent to our servers.
                    </p>
                    <p className="text-xs text-gray-400">
                      You need at least one API key to generate books. Google AI is recommended for beginners.
                    </p>
                  </div>

                  {/* Current Model Selection Display */}
                  <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                    <h4 className="font-semibold mb-2 text-white">Current Selection</h4>
                    <div className="text-sm text-gray-300">
                      <div>Provider: <span className="font-medium text-blue-400 capitalize">{localSettings.selectedProvider}</span></div>
                      <div>Model: <span className="font-medium text-green-400">{localSettings.selectedModel}</span></div>
                    </div>
                  </div>

                  {apiConfigs.map(api => {
                    const hasKey = !!localSettings[api.id];
                    return (
                      <div key={api.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor={api.id} className="text-sm font-medium text-gray-300 flex items-center gap-2">
                            {api.name} 
                            <a href={api.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title="Get API Key">
                              <ExternalLink size={12} />
                            </a>
                            {hasKey && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Connected</span>}
                          </label>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{api.description}</p>
                        <div className="relative">
                          <Key className="w-4 h-4 text-gray-500 absolute top-1/2 left-3 -translate-y-1/2" />
                          <input 
                            id={api.id} 
                            type={visibleApis[api.id] ? 'text' : 'password'} 
                            value={localSettings[api.id] as string} 
                            onChange={e => setLocalSettings(p => ({ ...p, [api.id]: e.target.value }))} 
                            placeholder={`Enter your ${api.name} API key`} 
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-9 pr-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-colors" 
                          />
                          <button type="button" onClick={() => setVisibleApis(p => ({...p, [api.id]: !p[api.id]}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors" title="Toggle visibility">{visibleApis[api.id] ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h3 className="font-semibold mb-2">Backup & Restore</h3>
                  <p className="text-sm text-gray-400 mb-4">Export your books and settings, or import from a backup file.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button onClick={handleExportData} className="btn btn-secondary w-full">
                      <Download size={16} />Export Data
                    </button>
                    <label className="btn btn-secondary w-full cursor-pointer">
                      <Upload size={16} />Import Data
                      <input type="file" ref={fileInputRef} onChange={handleImportPreview} accept=".json" className="hidden" />
                    </label>
                  </div>
                </div>
                
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                  <h4 className="font-semibold mb-2 text-white">Data Storage</h4>
                  <div className="text-sm text-gray-300 space-y-1">
                    <div>Books: <span className="font-medium">{storageUtils.getBooks().length} saved</span></div>
                    <div>Storage: <span className="font-medium">Browser localStorage</span></div>
                    <div>Sync: <span className="font-medium text-yellow-400">Local only</span></div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-red-400">Danger Zone</h3>
                  <p className="text-sm text-gray-400 mb-3">This will permanently delete all your books, settings, and progress.</p>
                  <button onClick={handleClearData} className="w-full btn bg-red-900/20 border border-red-500/30 text-red-400 hover:bg-red-900/40 transition-colors">
                    <Trash2 size={16} />Clear All Data
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'about' && (
               <div className="space-y-8 animate-fade-in text-center flex flex-col items-center justify-center h-full">
                <div className="space-y-6">
                  <img src="/white-logo.png" alt="Pustakam Logo" className="w-16 h-16 mx-auto" />
                  <div>
                    <h4 className="text-2xl font-bold text-white mb-2">Pustakam</h4>
                    <p className="text-sm text-gray-400 max-w-xs mx-auto">AI-powered book generation engine that transforms your ideas into comprehensive digital books.</p>
                  </div>
                </div>

                 <div className="grid grid-cols-2 gap-6 w-full max-w-sm">
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <Zap className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <h5 className="font-semibold text-sm text-white mb-1">AI-Powered</h5>
                    <p className="text-xs text-gray-400">Multiple AI models supported</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <BookOpen className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <h5 className="font-semibold text-sm text-white mb-1">Full Books</h5>
                    <p className="text-xs text-gray-400">Complete structured content</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <Globe className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                    <h5 className="font-semibold text-sm text-white mb-1">PWA Ready</h5>
                    <p className="text-xs text-gray-400">Works offline</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <Cpu className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                    <h5 className="font-semibold text-sm text-white mb-1">Smart Analytics</h5>
                    <p className="text-xs text-gray-400">Reading insights</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs text-gray-500">
                    Version 1.0.0 • Built with React & TypeScript
                  </div>
                  <div className="flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-colors">
                    <User size={14} />
                    <a href="https://linkedin.com/in/tanmay-kalbande" target="_blank" rel="noopener noreferrer" className="font-semibold text-sm">
                      by Tanmay Kalbande
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn btn-primary">Save Changes</button>
          </div>
        </div>
      </div>

      {/* Import Preview Modal */}
      {showImportModal && importPreview && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-yellow-400" size={20} />
              <h3 className="text-lg font-semibold text-white">Import Preview</h3>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <h4 className="font-medium text-white mb-2">Import Contains:</h4>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>📚 Books: <span className="font-medium">{importPreview.books.length}</span></div>
                  <div>⚙️ Settings: <span className="font-medium">{importPreview.settings ? 'Yes' : 'No'}</span></div>
                </div>
              </div>

              {(importPreview.conflicts.duplicateBooks > 0 || importPreview.conflicts.settingsConflict) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <h4 className="font-medium text-yellow-400 mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Conflicts Detected:
                  </h4>
                  <div className="text-sm text-yellow-300 space-y-1">
                    {importPreview.conflicts.duplicateBooks > 0 && (
                      <div>• {importPreview.conflicts.duplicateBooks} duplicate book(s)</div>
                    )}
                    {importPreview.conflicts.settingsConflict && (
                      <div>• Settings will be updated</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => executeImport('merge')}
                className="w-full btn bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition-colors"
              >
                <Plus size={16} />
                Smart Merge (Recommended)
              </button>
              <button 
                onClick={() => executeImport('replace')}
                className="w-full btn bg-orange-600/20 border border-orange-500/30 text-orange-400 hover:bg-orange-600/30 transition-colors"
              >
                <Download size={16} />
                Replace All Data
              </button>
              <button 
                onClick={() => {setShowImportModal(false); setImportPreview(null);}}
                className="w-full btn btn-secondary"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              <p><strong>Smart Merge:</strong> Adds new books and settings while preserving existing data.</p>
              <p><strong>Replace All:</strong> Completely replaces your current data with the imported data.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
