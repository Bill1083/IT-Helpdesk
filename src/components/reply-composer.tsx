'use client';

import { AlertTriangle, ArrowRight, ArrowUp, Ban, CheckCircle2, Globe, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { AttachButton, AttachmentList, useAttachments } from '@/components/attachments';
import { useAutosize } from '@/components/use-autosize';
import { cn } from '@/lib/client';
import { FIX_OUTCOMES } from '@/lib/outcomes';
import type { Attachment, Mode, ReportKind, ResolutionKind } from '@/lib/types';

type Outcome = 'worked' | 'failed' | 'error' | 'cant';

const OUTCOMES: { kind: Outcome; label: string; icon: typeof CheckCircle2; active: string }[] = [
  { kind: 'worked', label: 'Fixed it', icon: CheckCircle2, active: 'bg-emerald-500 text-white ring-emerald-500 shadow-sm' },
  { kind: 'failed', label: "Didn't work", icon: XCircle, active: 'bg-red-500 text-white ring-red-500 shadow-sm' },
  { kind: 'error', label: 'Different error', icon: AlertTriangle, active: 'bg-amber-500 text-white ring-amber-500 shadow-sm' },
  { kind: 'cant', label: "Can't do this step", icon: Ban, active: 'bg-zinc-600 text-white ring-zinc-600 shadow-sm dark:bg-zinc-500' },
];

const PLACEHOLDERS: Record<Exclude<Outcome, 'worked'> | 'ask' | 'chat' | 'done', string> = {
  ask: 'Ask about this step or add details: it updates this step instead of moving on…',
  chat: 'Ask a follow-up, or tell it what you found…',
  done: 'What was the outcome? (optional, saved for next time)',
  failed: 'What did you see instead? Paste the error if there was one…',
  error: 'Paste the new error message or a screenshot…',
  cant: "Why not? (no admin rights, setting missing, user unavailable…)",
};

export interface ComposerSubmit {
  kind: ReportKind;
  content: string;
  attachments: Attachment[];
  search: boolean;
  /** Set when closing the chat. */
  outcome?: ResolutionKind;
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
  const [outcome, setOutcome] = useState<ResolutionKind>(fixing ? 'fixed' : 'done');
  const [text, setText] = useState('');
  const [search, setSearch] = useState(false);
  const files = useAttachments();
  const textarea = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    startResolve: () => {
      setKind('worked');
      setOutcome(fixing ? 'fixed' : 'done');
      textarea.current?.focus();
    },
  }));

  useAutosize(textarea, text, 240);

  const resolving = kind === 'worked';
  // In a Fix chat, typing without picking a result is a question about the current step.
  const asking = fixing && kind === null;
  const canSend = !busy && !disabled && !files.uploading && (kind !== null || text.trim().length > 0 || files.attachments.length > 0);

  async function send() {
    if (!canSend) return;
    const value: ComposerSubmit = resolving
      ? { kind: 'worked', content: text.trim(), attachments: files.attachments, search: false, outcome: fixing ? outcome : 'done' }
      : { kind: kind ?? (fixing ? 'clarify' : 'note'), content: text.trim(), attachments: files.attachments, search };
    const ok = await onSubmit(value);
    if (ok) {
      setText('');
      setKind(null);
      setSearch(false);
      files.clear();
    }
  }

  const placeholder = resolving
    ? fixing
      ? FIX_OUTCOMES.find((o) => o.kind === outcome)!.placeholder
      : PLACEHOLDERS.done
    : kind
      ? PLACEHOLDERS[kind as Exclude<Outcome, 'worked'>]
      : fixing
        ? PLACEHOLDERS.ask
        : PLACEHOLDERS.chat;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      {fixing && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {OUTCOMES.map(({ kind: k, label, icon: Icon, active }) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind((current) => (current === k ? null : k));
                if (k === 'worked') setOutcome('fixed');
                textarea.current?.focus();
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition active:scale-[0.98]',
                kind === k
                  ? active
                  : 'bg-white text-zinc-600 ring-zinc-200 hover:text-zinc-900 hover:ring-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:text-zinc-100 dark:hover:ring-zinc-700',
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      {resolving && fixing && (
        <div className="mb-2 animate-pop-in rounded-xl bg-emerald-500/[0.06] p-1.5 ring-1 ring-inset ring-emerald-500/20">
          <p className="px-1.5 pb-1.5 pt-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">How did it end?</p>
          <div className="flex flex-wrap gap-1">
            {FIX_OUTCOMES.map((o) => (
              <button
                key={o.kind}
                type="button"
                aria-pressed={outcome === o.kind}
                onClick={() => {
                  setOutcome(o.kind);
                  textarea.current?.focus();
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition',
                  outcome === o.kind
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-emerald-500/40 dark:bg-zinc-900 dark:text-zinc-50'
                    : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        onDrop={files.onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'rounded-2xl bg-white shadow-lift ring-1 transition dark:bg-zinc-900',
          resolving
            ? 'ring-2 ring-emerald-500/60'
            : 'ring-zinc-200 focus-within:ring-2 focus-within:ring-accent/40 dark:ring-zinc-800',
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
          placeholder={placeholder}
          className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
        />
        {(files.attachments.length > 0 || files.uploading) && (
          <div className="px-4 pt-2">
            <AttachmentList attachments={files.attachments} uploading={files.uploading} onRemove={files.remove} />
          </div>
        )}
        <div className="flex items-center gap-1 px-2 pb-2 pt-1.5">
          <AttachButton onFiles={(list) => void files.add(list)} />
          {!resolving && (
            <button
              type="button"
              onClick={() => setSearch((v) => !v)}
              aria-pressed={search}
              title="Search the web live for this reply (a little slower)"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition',
                search
                  ? 'bg-accent/10 text-accent'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
              )}
            >
              <Globe className="size-4" /> {search ? 'Web search on' : 'Web'}
            </button>
          )}
          <span className="flex-1" />
          {files.error && <span className="truncate text-xs text-red-600 dark:text-red-400">{files.error}</span>}
          {fixing && !resolving && !files.error && (
            <span className="hidden items-center gap-1 text-xs text-zinc-400 sm:inline-flex">
              {asking ? (
                <>
                  <RefreshCw className="size-3.5" /> Updates this step
                </>
              ) : (
                <>
                  <ArrowRight className="size-3.5" /> Next step
                </>
              )}
            </span>
          )}
          {resolving && (
            <button
              type="button"
              onClick={() => setKind(null)}
              className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
          {resolving ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {fixing ? (outcome === 'unresolved' ? 'Close chat' : 'Mark resolved') : 'Mark done'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Send"
              className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
