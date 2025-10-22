export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function generateConversationTitle(firstMessage: string): string {
  const maxLength = 50;
  const cleaned = firstMessage.trim().replace(/\n+/g, ' ');
  return cleaned.length > maxLength 
    ? cleaned.slice(0, maxLength).trim() + '...'
    : cleaned;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}