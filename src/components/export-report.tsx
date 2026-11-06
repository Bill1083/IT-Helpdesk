'use client';

import { FileDown, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ErrorNotice } from '@/components/error-notice';
import { useAutosize } from '@/components/use-autosize';

/** The download name the server chose, from Content-Disposition. */
function downloadName(header: string | null): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // fall through
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? 'IT service report.pdf';
}

/**
 * "Export PDF": lets the admin add anything that never made it into the
 * chat, then downloads the service report.
 */
export function ExportReportDialog({
  problemId,
  initialNotes,
  onClose,
  onSaved,
}: {
  problemId: string;
  initialNotes: string;
  onClose: () => void;
  /** The notes as saved on the server, so reopening the dialog shows them. */
  onSaved: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useAutosize(textarea, notes, 320);

  useEffect(() => {
    textarea.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/problems/${problemId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (!response.ok) {
        if (response.status === 401) window.location.href = '/login';
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName(response.headers.get('Content-Disposition'));
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onSaved(notes.trim());
      toast.success('Report downloaded', { description: link.download });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button aria-label="Close" className="absolute inset-0 cursor-default bg-zinc-950/40 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="relative w-full max-w-lg animate-pop-in rounded-t-2xl bg-white p-5 shadow-lift ring-1 ring-zinc-200 sm:rounded-2xl sm:p-6 dark:bg-zinc-900 dark:ring-zinc-800"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <FileDown className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="export-title" className="font-semibold text-zinc-900 dark:text-zinc-50">
              Export service report
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">A PDF summary of this chat: what was needed, what was done and how it was fixed.</p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="size-4" />
          </button>
        </div>

        <label htmlFor="report-notes" className="mt-5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Anything else to include? <span className="font-normal text-zinc-400">Optional</span>
        </label>
        <textarea
          id="report-notes"
          ref={textarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !busy) void create();
          }}
          rows={4}
          disabled={busy}
          placeholder="Things you tried that aren't in the chat, extra details, who you spoke to, anything the client should know…"
          className="mt-1.5 w-full resize-none rounded-xl bg-white px-3.5 py-2.5 text-sm leading-relaxed outline-none ring-1 ring-zinc-200 transition placeholder:text-zinc-400 focus:ring-2 focus:ring-accent/40 disabled:opacity-60 dark:bg-zinc-950 dark:ring-zinc-800"
        />
        <p className="mt-1.5 text-xs text-zinc-400">Saved with this chat, so it's here next time you export.</p>

        {error && <ErrorNotice error={error} context="ai" onRetry={() => void create()} className="mt-4" />}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={() => void create()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {busy ? 'Writing the report…' : 'Create PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
