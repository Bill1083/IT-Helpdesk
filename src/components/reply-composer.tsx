'use client';

import { AlertTriangle, ArrowUp, Ban, CheckCircle2, Globe, Loader2, XCircle } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { AttachButton, AttachmentList, useAttachments } from '@/components/attachments';
import { cn } from '@/lib/client';
import type { Attachment, Mode, ReportKind } from '@/lib/types';

type Outcome = Exclude<ReportKind, 'start' | 'note'>;

const OUTCOMES: { kind: Outcome; label: string; icon: typeof CheckCircle2; active: string }[] = [
  { kind: 'worked', label: 'Fixed it', icon: CheckCircle2, active: 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { kind: 'failed', label: "Didn't work", icon: XCircle, active: 'border-red-400 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300' },
  { kind: 'error', label: 'Different error', icon: AlertTriangle, active: 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  { kind: 'cant', label: "Can't do this step", icon: Ban, active: 'border-zinc-400 bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200' },
];

const PLACEHOLDERS: Record<Outcome | 'none' | 'chat' | 'done', string> = {
  none: 'Report back: what happened? Paste errors or screenshots…',
  chat: 'Ask a follow-up, or tell it what you found…',
  done: 'What was the outcome? (optional - saved for next time)',
  worked: 'What fixed it? (optional - saved so next time is instant)',
  failed: 'What did you see instead? Paste the error if there was one…',
  error: 'Paste the new error message or a screenshot…',
  cant: "Why not? (no admin rights, setting missing, user unavailable…)",
};

export interface ComposerSubmit {
  kind: ReportKind;
  content: string;
  attachments: Attachment[];
  search: boolean;
}

export interface ReplyComposerHandle {
  startResolve: () => void;
}

export const ReplyComposer = forwardRef<
  ReplyComposerHandle,
  { mode: Mode; busy: boolean; disabled?: boolean; onSubmit: (value: ComposerSubmit) => Promise<boolean> }
>(function ReplyComposer({ mode, busy, disabled, onSubmit }, ref) {
  // Outcome chips only make sense while fixing something.
  const fixing = mode === 'fix';
  const [kind, setKind] = useState<Outcome | null>(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState(false);
  const files = useAttachments();
  const textarea = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    startResolve: () => {
      setKind('worked');
      textarea.current?.focus();
    },
  }));

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    // Only show a scrollbar once the text outgrows the cap.
    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden';
  }, [text]);

  const canSend = !busy && !disabled && !files.uploading && (kind !== null || text.trim().length > 0 || files.attachments.length > 0);

  async function send() {
    if (!canSend) return;
    const ok = await onSubmit({ kind: kind ?? 'note', content: text.trim(), attachments: files.attachments, search });
    if (ok) {
      setText('');
      setKind(null);
      setSearch(false);
      files.clear();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className={cn('mb-2 flex flex-wrap gap-1.5', !fixing && 'hidden')}>
        {OUTCOMES.map(({ kind: k, label, icon: Icon, active }) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind((current) => (current === k ? null : k));
              textarea.current?.focus();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
              kind === k
                ? active
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      <div
        onDrop={files.onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'rounded-2xl border bg-white shadow-sm transition dark:bg-zinc-900',
          kind === 'worked' ? 'border-emerald-400 dark:border-emerald-700' : 'border-zinc-200 focus-within:border-zinc-300 dark:border-zinc-700 dark:focus-within:border-zinc-600',
        )}
      >
        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={files.onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder={PLACEHOLDERS[kind === 'worked' && !fixing ? 'done' : (kind ?? (fixing ? 'none' : 'chat'))]}
          className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3 text-[15px] leading-relaxed outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
        />
        {(files.attachments.length > 0 || files.uploading) && (
          <div className="px-4 pt-2">
            <AttachmentList attachments={files.attachments} uploading={files.uploading} onRemove={files.remove} />
          </div>
        )}
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <AttachButton onFiles={(list) => void files.add(list)} />
          {kind !== 'worked' && (
            <button
              type="button"
              onClick={() => setSearch((v) => !v)}
              title="Search the web live for this step (a little slower)"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition',
                search
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
              )}
            >
              <Globe className="size-4" /> {search ? 'Web search on' : 'Web'}
            </button>
          )}
          <span className="flex-1" />
          {files.error && <span className="truncate text-xs text-red-600">{files.error}</span>}
          {kind === 'worked' && !fixing && (
            <button
              type="button"
              onClick={() => setKind(null)}
              className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
          {kind === 'worked' ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {fixing ? 'Mark resolved' : 'Mark done'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Send"
              className="flex size-9 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
