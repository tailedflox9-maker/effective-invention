// src/utils/logger.ts
interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'api';
  message: string;
  data?: any;
  module?: string;
  apiDetails?: {
    provider?: string;
    model?: string;
    prompt?: string; // Added prompt field
    promptLength?: number;
    responseLength?: number;
    duration?: number;
  };
}

class ConsoleLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 500; // Increased for detailed logging
  private sessionStartTime = new Date();

  private addLog(level: LogEntry['level'], message: string, data?: any, module?: string, apiDetails?: any) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
      module,
      apiDetails
    };
    
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Enhanced console logging with colors
    const logMethod = console[level === 'api' ? 'log' : level] || console.log;
    const prefix = `[${level.toUpperCase()}]${module ? ` [${module}]` : ''}`;
    
    if (data || apiDetails) {
      logMethod(prefix, message, { data, apiDetails });
    } else {
      logMethod(prefix, message);
    }

    this.notifyListeners();
  }

  private listeners: Array<(logs: LogEntry[]) => void> = [];

  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.logs]));
  }

  info(message: string, data?: any, module?: string) {
    this.addLog('info', message, data, module);
  }

  warn(message: string, data?: any, module?: string) {
    this.addLog('warn', message, data, module);
  }

  error(message: string, data?: any, module?: string) {
    this.addLog('error', message, data, module);
  }

  debug(message: string, data?: any, module?: string) {
    this.addLog('debug', message, data, module);
  }

  api(message: string, apiDetails: any, module?: string) {
    this.addLog('api', message, undefined, module, apiDetails);
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.sessionStartTime = new Date();
    this.notifyListeners();
  }

  exportLogs(): string {
    const header = [
      '='.repeat(100),
      'PUSTAKAM AI BOOK GENERATION ENGINE - COMPREHENSIVE LOG EXPORT',
      '='.repeat(100),
      `Export Date: ${new Date().toISOString()}`,
      `Session Started: ${this.sessionStartTime.toISOString()}`,
      `Session Duration: ${Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60)} minutes`,
      `Total Log Entries: ${this.logs.length}`,
      '='.repeat(100),
      ''
    ].join('\n');

    const logEntries = this.logs.map(log => {
      const timestamp = log.timestamp.toISOString();
      const module = log.module ? `[${log.module}]` : '';
      const level = `[${log.level.toUpperCase()}]`;
      
      let entry = `${timestamp} ${level} ${module} ${log.message}`;
      
      if (log.apiDetails) {
        entry += `\n  API Details:`;
        entry += `\n    Provider: ${log.apiDetails.provider || 'N/A'}`;
        entry += `\n    Model: ${log.apiDetails.model || 'N/A'}`;
        entry += `\n    Prompt Length: ${log.apiDetails.promptLength || 0} chars`;
        entry += `\n    Response Length: ${log.apiDetails.responseLength || 0} chars`;
        entry += `\n    Duration: ${log.apiDetails.duration || 0}ms`;

        // =======================================================
        //  THIS BLOCK INCLUDES THE FULL PROMPT IN THE LOG FILE
        // =======================================================
        if (log.apiDetails.prompt) {
          entry += `\n\n  --- PROMPT SENT TO AI ---\n${log.apiDetails.prompt}\n  --- END OF PROMPT ---\n`;
        }
        // =======================================================
      }
      
      if (log.data) {
        entry += `\n  Data: ${JSON.stringify(log.data, null, 2)}`;
      }
      
      return entry;
    }).reverse().join('\n\n' + '-'.repeat(100) + '\n\n'); // Added separator for readability

    return header + '\n' + logEntries;
  }
}

export const logger = new ConsoleLogger();
