import React, { useState, useMemo } from 'react';
import {
  Settings, Trash2, X, ChevronLeft, ChevronRight, Search, Plus,
  Beaker, Palette, Building, Cpu, Brain, Check, AlertCircle, ChevronDown, User, Book
} from 'lucide-react';
import { BookProject, APISettings, BookCategory, ModelProvider } from '../types';

interface SidebarProps {
  books: BookProject[];
  currentBookId: string | null;
  onSelectBook: (id: string | null) => void;
  onDeleteBook: (id: string) => void;
  onOpenSettings: () => void;
  onNewBook: () => void;
  onCloseSidebar: () => void;
  isSidebarOpen: boolean;
  isFolded?: boolean;
  onToggleFold?: () => void;
  settings: APISettings;
  onModelChange: (model: string, provider: ModelProvider) => void;
}

const getCategoryIcon = (category?: BookCategory) => {
  switch (category) {
    case 'programming': return Cpu;
    case 'science': return Beaker;
    case 'art': return Palette;
    case 'business': return Building;
    case 'general': return Book;
    default: return Book;
  }
};

// SVG Icons from public folder with white filter
const GoogleIcon = () => (
  <img src="/gemini.svg" alt="Google AI" className="w-5 h-5 filter brightness-0 invert" />
);

const MistralIcon = () => (
  <img src="/mistral.svg" alt="Mistral AI" className="w-5 h-5 filter brightness-0 invert" />
);

const ZhipuIcon = () => (
  <img src="/zhipu.svg" alt="ZhipuAI" className="w-5 h-5 filter brightness-0 invert" />
);

// Enhanced model configuration with all models
const modelConfig = {
  google: {
    name: "Google AI",
    icon: GoogleIcon,
    models: [
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Fast, lightweight model' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Enhanced lightweight model' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Balanced speed and capability' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Latest flash model' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Previous generation flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Most capable model' },
    ]
  },
  mistral: {
    name: "Mistral AI",
    icon: MistralIcon,
    models: [
      { id: 'open-mistral-7b', name: 'Open Mistral 7B', description: 'Open source 7B model' },
      { id: 'open-mixtral-8x7b', name: 'Open Mixtral 8x7B', description: 'Mixture of experts model' },
      { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Cost-effective model' },
      { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Most powerful model' },
    ]
  },
  zhipu: {
    name: "ZhipuAI",
    icon: ZhipuIcon,
    models: [
      { id: 'glm-4.5-flash', name: 'GLM 4.5 Flash', description: 'Chinese AI model' },
    ]
  }
};

export function Sidebar({
  books,
  currentBookId,
  onSelectBook,
  onDeleteBook,
  onOpenSettings,
  onNewBook,
  onCloseSidebar,
  isFolded = false,
  onToggleFold,
  isSidebarOpen,
  settings,
  onModelChange,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const sortedBooks = useMemo(() => {
    const filtered = books.filter(book =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [books, searchQuery]);

  const hasApiKeyForProvider = (provider: ModelProvider): boolean => {
    switch (provider) {
      case 'google': return !!settings.googleApiKey;
      case 'mistral': return !!settings.mistralApiKey;
      case 'zhipu': return !!settings.zhipuApiKey;
      default: return false;
    }
  };

  const getCurrentModelInfo = () => {
    const provider = modelConfig[settings.selectedProvider];
    const model = provider?.models.find(m => m.id === settings.selectedModel);
    return { provider, model };
  };

  const { provider: currentProvider, model: currentModel } = getCurrentModelInfo();

  const handleModelChange = (modelId: string, provider: ModelProvider) => {
    try {
      const hasApiKey = hasApiKeyForProvider(provider);
      if (!hasApiKey) {
        alert(`Please configure your ${modelConfig[provider].name} API key in Settings first.`);
        onOpenSettings();
        setModelDropdownOpen(false);
        return;
      }

      // Validate model exists for provider
      const providerConfig = modelConfig[provider];
      const modelExists = providerConfig.models.some(m => m.id === modelId);

      if (!modelExists) {
        console.error(`Model ${modelId} not found for provider ${provider}`);
        return;
      }

      onModelChange(modelId, provider);
      setModelDropdownOpen(false);
    } catch (error) {
      console.error('Error changing model:', error);
      alert('Failed to change model. Please try again.');
    }
  };

  // Improved sidebar classes with smooth transitions
  const sidebarClasses = `
    sidebar
    ${isSidebarOpen ? 'sidebar-open' : 'hidden lg:flex'}
    transition-all duration-300 ease-in-out
    ${isFolded ? 'w-16' : 'w-64'}
    overflow-hidden
  `;

  return (
    <div className="relative">
      <aside className={sidebarClasses}>
        {/* Section 1: Header (Logo + New Book Button) */}
        <div className={`flex flex-col transition-all duration-300 ease-in-out ${
          isFolded
            ? 'items-center gap-1 p-2 border-b-0'
            : 'gap-2 p-4 pb-2'
        }`}>
          <div className={`flex items-center transition-all duration-300 ease-in-out ${
            isFolded ? 'justify-center flex-col gap-1' : 'justify-between w-full'
          }`}>
            {/* Logo Section (Pustakam icon + text) */}
            <a href="/" className={`flex items-center group transition-all duration-300 ease-in-out ${
              isFolded ? 'flex-col gap-1 px-1 py-1' : 'gap-2.5 px-1'
            }`}>
              <img
                src="/white-logo.png"
                alt="Logo"
                className="w-8 h-8 shrink-0 transition-all duration-300"
              />
              <div className={`transition-all duration-300 ease-in-out ${
                isFolded ? 'opacity-0 scale-0' : 'opacity-100 scale-100'
              }`}>
                {!isFolded && (
                  <>
                    <h1 className="text-lg font-bold whitespace-nowrap">Pustakam</h1>
                    <p className="text-xs text-gray-500 -mt-1 whitespace-nowrap">injin</p>
                  </>
                )}
              </div>
              {isFolded && (
                <div className="text-center opacity-100 scale-100 transition-all duration-300">
                  <h1 className="text-xs font-bold leading-tight">Pustakam</h1>
                </div>
              )}
            </a>
            {/* Close Button - Mobile Only */}
            <div className={`transition-all duration-300 ease-in-out ${
              isFolded ? 'opacity-0 scale-0 w-0' : 'opacity-100 scale-100'
            }`}>
              {!isFolded && (
                <button
                  onClick={onCloseSidebar}
                  className="btn-ghost lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Close sidebar"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Model Selection */}
        <div className={`transition-all duration-300 ease-in-out ${
          isFolded ? 'p-2 border-b-0' : 'px-4 pt-2 pb-3'
        }`}>
          <div className="relative">
            {isFolded ? (
              /* Folded Model Indicator */
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                  className={`p-2.5 rounded-lg border transition-all duration-200 ${
                    modelDropdownOpen
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                  title={`${currentProvider?.name || 'Select Provider'} - ${currentModel?.name || 'No model selected'}`}
                >
                  {currentProvider ? <currentProvider.icon /> : <Brain className="w-5 h-5" />}
                </button>
                <div className={`text-xs text-gray-400 text-center leading-tight max-w-[50px] truncate transition-all duration-300 ${
                  modelDropdownOpen ? 'opacity-50' : 'opacity-100'
                }`}>
                  {currentProvider && currentProvider.name.split(' ')[0]}
                </div>
              </div>
            ) : (
              /* Expanded Model Selection */
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
                  modelDropdownOpen
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  {currentProvider ? <currentProvider.icon /> : <Brain className="w-5 h-5" />}
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">
                      {currentProvider?.name || 'Select Provider'}
                    </div>
                    <div className="text-xs text-gray-400 truncate max-w-[140px]">
                      {currentModel?.name || 'No model selected'}
                    </div>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                  modelDropdownOpen ? 'rotate-180' : ''
                }`} />
              </button>
            )}

            {/* Dropdown Menu */}
            {modelDropdownOpen && (
              <div className={`absolute ${
                isFolded ? 'left-full ml-2 top-0' : 'top-full left-0 right-0 mt-1'
              } bg-[var(--color-sidebar)] border border-white/10 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto ${
                isFolded ? 'w-64' : ''
              } animate-in fade-in-0 zoom-in-95 duration-200`}>
                {(Object.entries(modelConfig) as [ModelProvider, typeof modelConfig.google][]).map(([provider, config]) => {
                  const hasApiKey = hasApiKeyForProvider(provider);
                  const IconComponent = config.icon;

                  return (
                    <div key={provider} className="p-1">
                      {/* Provider Header */}
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <IconComponent />
                          {config.name}
                          {!hasApiKey && (
                            <div className="flex items-center gap-1 ml-auto">
                              <AlertCircle className="w-3 h-3 text-red-400" />
                              <span className="text-xs text-red-400">No Key</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Models List */}
                      <div className="py-1">
                        {config.models.map((model) => {
                          const isSelected = settings.selectedModel === model.id && settings.selectedProvider === provider;

                          return (
                            <button
                              key={model.id}
                              onClick={() => {
                                if (!hasApiKey) {
                                  alert(`Please configure your ${config.name} API key in Settings first.`);
                                  onOpenSettings();
                                  setModelDropdownOpen(false);
                                  return;
                                }
                                handleModelChange(model.id, provider);
                              }}
                              disabled={!hasApiKey}
                              className={`w-full flex items-center justify-between px-3 py-2.5 text-left rounded-md transition-all duration-150 group ${
                                isSelected
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : hasApiKey
                                    ? 'hover:bg-white/5 text-gray-300 hover:text-white'
                                    : 'text-gray-500 cursor-not-allowed'
                              }`}
                              title={!hasApiKey ? `Configure ${config.name} API key in Settings` : model.description}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                {isSelected && <IconComponent />}
                                <div>
                                  <div className="text-sm font-medium">{model.name}</div>
                                  <div className="text-xs opacity-70">{model.description}</div>
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-blue-400" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Settings Link */}
                <div className="border-t border-white/10 p-1">
                  <button
                    onClick={() => {
                      onOpenSettings();
                      setModelDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-all duration-150"
                  >
                    <Settings className="w-4 h-4" />
                    Configure API Keys
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Books List */}
        <div className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${
          isFolded ? 'p-2' : 'p-4'
        }`}>
          <div className={`transition-all duration-300 ease-in-out ${
            isFolded ? 'opacity-0 scale-0 h-0 mb-0' : 'opacity-100 scale-100 h-auto mb-3'
          }`}>
            {!isFolded && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 transition-colors"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            {sortedBooks.map(book => {
              const isSelected = currentBookId === book.id;
              const CategoryIcon = getCategoryIcon(book.category);

              return (
                <div
                  key={book.id}
                  onClick={() => onSelectBook(book.id)}
                  className={`group relative flex items-center w-full rounded-lg cursor-pointer transition-all duration-200 ${
                    isFolded ? 'justify-center p-2.5' : 'gap-3 p-2.5'
                  } ${
                    isSelected
                      ? 'bg-white text-black font-semibold'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                  title={isFolded ? book.title : undefined}
                >
                  <CategoryIcon className={`w-4 h-4 shrink-0 transition-colors ${
                    isSelected ? 'text-black' : 'text-gray-400'
                  }`} />
                  <span className={`text-sm font-medium truncate transition-all duration-300 ease-in-out ${
                    isFolded ? 'opacity-0 scale-0 w-0' : 'opacity-100 scale-100 flex-1'
                  }`}>
                    {!isFolded && book.title}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteBook(book.id); }}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all duration-200 ${
                      isFolded
                        ? 'opacity-0 scale-0 w-0'
                        : 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
                    } ${
                      isSelected
                        ? 'text-gray-600 hover:text-red-500 hover:bg-black/10'
                        : 'text-gray-500 hover:text-red-400 hover:bg-red-900/20'
                    }`}
                    title="Delete book"
                  >
                    {!isFolded && <Trash2 size={14} />}
                  </button>
                </div>
              );
            })}
          </div>

          <div className={`text-center p-6 text-sm text-gray-500 transition-all duration-300 ease-in-out ${
            sortedBooks.length === 0 && !isFolded ? 'opacity-100 scale-100' : 'opacity-0 scale-0 h-0 p-0'
          }`}>
            {sortedBooks.length === 0 && !isFolded && <p>No books found.</p>}
          </div>
        </div>

        {/* Footer - Settings and Creator Credit, with Collapse Button */}
        <div className={`border-t border-[var(--color-border)] bg-white/5 transition-all duration-300 ease-in-out ${
          isFolded ? 'p-2' : ''
        }`}>
          {isFolded ? (
            /* Folded Footer */
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onOpenSettings}
                className="p-2.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 w-full flex justify-center"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              {onToggleFold && (
                <button
                  onClick={onToggleFold}
                  className="p-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-all duration-200 w-full flex justify-center"
                  title="Expand sidebar"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          ) : (
            /* Expanded Footer */
            <>
              {/* Settings and Collapse Buttons */}
              <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <button
                  onClick={onOpenSettings}
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 group"
                >
                  <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
                  <span>Settings</span>
                </button>
                {onToggleFold && (
                  <button
                    onClick={onToggleFold}
                    className="p-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-all duration-200 shrink-0"
                    title="Collapse sidebar"
                  >
                    <ChevronLeft size={16} />
                  </button>
                )}
              </div>

              {/* Creator Credit */}
              <div className="p-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <User className="w-4 h-4" />
                  <span>Made by</span>
                  <a
                    href="https://linkedin.com/in/tanmay-kalbande"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-gray-400 hover:text-white transition-colors duration-200"
                  >
                    Tanmay Kalbande
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Click outside handler */}
        {modelDropdownOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setModelDropdownOpen(false)}
          />
        )}
      </aside>
    </div>
  );
}
