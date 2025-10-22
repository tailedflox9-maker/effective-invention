// src/components/InstallPrompt.tsx
import React from 'react';
import { Download } from 'lucide-react';

interface InstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export function InstallPrompt({ onInstall, onDismiss }: InstallPromptProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-2xl p-4 z-50 animate-slide-up">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-[var(--color-sidebar)] rounded-lg flex items-center justify-center p-2">
          <img src="/pustakam-logo.png" alt="Pustakam Logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--color-text-primary)] text-base">Install Pustakam App</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Get the best full-screen experience.</p>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <button onClick={onDismiss} className="btn btn-secondary btn-sm">Later</button>
        <button onClick={onInstall} className="btn btn-primary btn-sm"><Download className="w-4 h-4" />Install</button>
      </div>
    </div>
  );
}
