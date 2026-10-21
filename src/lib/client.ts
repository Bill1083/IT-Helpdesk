/** Browser-side helpers. Nothing here may import Node-only modules. */

import type { Attachment } from '@/lib/types';

export const PROBLEMS_CHANGED = 'ithd:problems-changed';

export function notifyProblemsChanged(): void {
  window.dispatchEvent(new Event(PROBLEMS_CHANGED));
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) window.location.href = '/login';
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export async function uploadFile(file: File): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file, file.name || 'pasted.png');
  const { attachment } = await api<{ attachment: Attachment }>('/api/uploads', { method: 'POST', body: form });
  return attachment;
}

/** Yield each JSON line of a streamed NDJSON response as it arrives. */
export async function* readNdjson<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as T;
      newline = buffer.indexOf('\n');
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as T;
}

/** "### Step 2 - Clear the cache" -> "Step 2 - Clear the cache". */
export function stepTitle(content: string): string | null {
  const match = content.match(/^#{2,4}\s*(.+)$/m);
  return match ? match[1].replace(/\*\*/g, '').trim() : null;
}

export const REPORT_LABELS: Record<string, string> = {
  worked: 'Fixed it',
  failed: "Didn't work",
  error: 'Different error',
  cant: "Couldn't do this step",
};

export function shortDate(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
