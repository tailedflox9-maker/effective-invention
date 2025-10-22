// src/utils/logger.ts
interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

class ConsoleLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  private addLog(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data
    };
    
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Still log to browser console for development
    const logMethod = console[level] || console.log;
    if (data) {
      logMethod(`[${level.toUpperCase()}]`, message, data);
    } else {
      logMethod(`[${level.toUpperCase()}]`, message);
    }

    // Trigger UI update if logger component is mounted
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

  info(message: string, data?: any) {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: any) {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: any) {
    this.addLog('error', message, data);
  }

  debug(message: string, data?: any) {
    this.addLog('debug', message, data);
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.notifyListeners();
  }
}

export const logger = new ConsoleLogger();
