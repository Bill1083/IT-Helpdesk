'use client';

import {
  AlertTriangle,
  Ban,
  BrainCircuit,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  History,
  Loader2,
  MessageCircleQuestion,
  MessageSquareShare,
  RotateCcw,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AttachmentList } from '@/components/attachments';
import { Logo } from '@/components/logo';
import { Markdown } from '@/components/markdown';
import { REPORT_LABELS, api, cn, longDate, stepTitle } from '@/lib/client';
import type { StepGroup } from '@/lib/steps';
import type { Message, Source } from '@/lib/types';

/* ------------------------------------------------------------- outcomes */

type Outcome = 'pending' | 'worked' | 'failed' | 'error' | 'cant' | 'answered';

const OUTCOME_KINDS = new Set(['worked', 'failed', 'error', 'cant']);

function outcomeOf(reports: Message[], isLatest: boolean): Outcome {
  const report = reports.find((r) => OUTCOME_KINDS.has(r.kind));
  if (report) return report.kind as Outcome;
  return reports.length || !isLatest ? 'answered' : 'pending';
}

const MARKER: Record<Outcome, string> = {
  pending: 'bg-accent text-accent-fg animate-soft-pulse',
  worked: 'bg-emerald-500 text-white',
  failed: 'bg-red-500 text-white',
  error: 'bg-amber-500 text-white',
  cant: 'bg-zinc-400 text-white dark:bg-zinc-600',
  answered: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const CHIP: Record<string, string> = {
  worked: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300',
  error: 'bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300',
  cant: 'bg-zinc-500/10 text-zinc-700 ring-zinc-500/20 dark:text-zinc-300',
  closed: 'bg-zinc-500/10 text-zinc-700 ring-zinc-500/20 dark:text-zinc-300',
};

function Marker({ outcome, number }: { outcome: Outcome; number: number }) {
  const icon =
    outcome === 'worked' ? <Check className="size-4" strokeWidth={3} /> :
    outcome === 'failed' ? <X className="size-4" strokeWidth={3} /> :
    outcome === 'error' ? <AlertTriangle className="size-3.5" strokeWidth={2.5} /> :
    outcome === 'cant' ? <Ban className="size-3.5" strokeWidth={2.5} /> :
    <span className="text-[13px] font-semibold tabular-nums">{number}</span>;
  return (
    <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-zinc-950', MARKER[outcome])}>
      {icon}
    </span>
  );
}

export function OutcomeChip({ kind }: { kind: string }) {
  const label = REPORT_LABELS[kind];
  if (!label) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset', CHIP[kind])}>
      {label}
    </span>
  );
}

/* --------------------------------------------------------- the request */

/** The original problem or question, as reported. */
export function RequestCard({ message, reporter }: { message: Message; reporter: string | null }) {
  return (
    <section className="animate-fade-up rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/80 sm:p-5 dark:bg-zinc-900/60 dark:ring-zinc-800">
      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        <span className="flex size-5 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800">
          <User className="size-3" />
        </span>
        <span className="font-medium text-zinc-600 dark:text-zinc-300">{reporter ?? 'Request'}</span>
        <span>·</span>
        <time suppressHydrationWarning>{longDate(message.createdAt)}</time>
      </div>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">{message.content}</p>
      {message.attachments.length > 0 && (
        <div className="mt-3">
          <AttachmentList attachments={message.attachments} />
        </div>
      )}
    </section>
  );
}

/** What the admin reported back, or a follow-up in a chat-style conversation. */
export function ReportBubble({ message, compact }: { message: Message; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex animate-fade-up items-start gap-2 text-sm">
        <OutcomeChip kind={message.kind} />
        {message.content && <p className="min-w-0 whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">{message.content}</p>}
        {message.attachments.length > 0 && <AttachmentList attachments={message.attachments} />}
      </div>
    );
  }
  return (
    <div className="flex animate-fade-up justify-end">
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800/80">
        <OutcomeChip kind={message.kind} />
        {message.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.content}</p>}
        <AttachmentList attachments={message.attachments} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- actions */

function hostOf(source: Source): string {
  try {
    return source.title.includes('.') && !source.title.includes(' ') ? source.title : new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.title;
  }
}

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer noopener"
          title={s.title}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{hostOf(s)}</span>
        </a>
      ))}
    </div>
  );
}

function ActionButton({ onClick, title, children, className }: { onClick: () => void; title: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

interface ActionProps {
  message: Message;
  problemId: string;
  canAct: boolean;
  claudeAvailable: boolean;
  retryLabel: string;
  onThinkHarder: () => void;
  onRetry: () => void;
}

function StepActions({ message, problemId, canAct, claudeAvailable, retryLabel, onThinkHarder, onRetry }: ActionProps) {
  const [writing, setWriting] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  async function copyForUser() {
    setWriting(true);
    try {
      const { text } = await api<{ text: string }>(`/api/problems/${problemId}/employee-message`, {
        method: 'POST',
        json: { messageId: message.id },
      });
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Copied a friendly version for Slack');
      } catch {
        setFallbackText(text);
      }
    } catch (e) {
      toast.error("Couldn't write the message", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="-ml-2 flex flex-wrap items-center gap-0.5">
        <ActionButton onClick={copyForUser} title="Rewrite this as a friendly message for the employee and copy it">
          {writing ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquareShare className="size-3.5" />} Copy for user
        </ActionButton>
        <ActionButton
          onClick={async () => {
            await navigator.clipboard.writeText(message.content);
            toast.success('Copied');
          }}
          title="Copy as Markdown"
        >
          <Copy className="size-3.5" /> Copy
        </ActionButton>
        {message.sources.length > 0 && (
          <ActionButton onClick={() => setShowSources((v) => !v)} title="Web pages this drew on">
            <ExternalLink className="size-3.5" /> {message.sources.length} source{message.sources.length === 1 ? '' : 's'}
          </ActionButton>
        )}
        {canAct && claudeAvailable && (
          <ActionButton
            onClick={onThinkHarder}
            title="Redo this with Claude: deeper reasoning and live web search (slower)"
            className="text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
          >
            <BrainCircuit className="size-3.5" /> Think harder
          </ActionButton>
        )}
        {canAct && (
          <ActionButton onClick={onRetry} title="Get a different answer instead">
            <RotateCcw className="size-3.5" /> {retryLabel}
          </ActionButton>
        )}
        {message.provider === 'claude' && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
            <BrainCircuit className="size-3" /> Claude
          </span>
        )}
      </div>
      {showSources && (
        <div className="mt-2 animate-pop-in">
          <SourceList sources={message.sources} />
        </div>
      )}
      {fallbackText && (
        <div className="mt-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="mb-2 text-xs text-zinc-500">The browser blocked the clipboard. Select and copy:</p>
          <textarea readOnly value={fallbackText} rows={6} className="w-full resize-none bg-transparent text-sm outline-none" />
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- steps */

/** "Step 2 - Clear the cache" -> "Clear the cache". */
function cleanTitle(content: string, fallback: string): string {
  const raw = stepTitle(content) ?? content.split('\n').find((l) => l.trim())?.replace(/[*#_`]/g, '').trim() ?? fallback;
  return raw.replace(/^step\s*\d+\s*[-–—:.]\s*/i, '').slice(0, 120) || fallback;
}

/** The step's own heading is shown in the row, so drop it from the body. */
function bodyWithoutHeading(content: string): string {
  return content.replace(/^#{2,4}\s*.+$/m, '').trim();
}

/** The admin's questions about a step, shown above the revised step. */
function Clarifications({ items }: { items: Message[] }) {
  return (
    <div className="mb-3 space-y-1.5">
      {items.map((m) => (
        <div key={m.id} className="flex items-start gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-300">{m.content}</p>
            {m.attachments.length > 0 && (
              <div className="mt-1.5">
                <AttachmentList attachments={m.attachments} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Earlier versions of a step that a question changed, folded away. */
function EarlierVersions({ versions }: { versions: Message[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <History className="size-3.5" />
        {open ? 'Hide' : 'Show'} {versions.length === 1 ? 'the original step' : `${versions.length} earlier versions`}
        <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 space-y-3 opacity-80">
          {versions.map((v) => (
            <div key={v.id} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/50">
              <Markdown text={bodyWithoutHeading(v.content)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StreamingBody({ text, status, step }: { text: string; status: string | null; step: boolean }) {
  return text ? (
    <div>
      <Markdown text={step ? bodyWithoutHeading(text) : text} />
      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent/70 align-middle" />
    </div>
  ) : (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin text-accent" />
        <span>{status ?? 'Working it out…'}</span>
      </div>
      <div className="skeleton h-3 w-11/12" />
      <div className="skeleton h-3 w-9/12" />
      <div className="skeleton h-3 w-10/12" />
    </div>
  );
}

/** One row of the Fix stepper: marker, title, outcome, and the step itself. */
export function StepItem({
  number,
  group,
  isLatest,
  isLast,
  streaming,
  ...actions
}: Omit<ActionProps, 'message'> & {
  number: number;
  group: StepGroup;
  isLatest: boolean;
  isLast: boolean;
  /** A revision of this step that is being written right now. */
  streaming?: { text: string; status: string | null } | null;
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const message = group.versions[group.versions.length - 1];
  const { reports, clarifications } = group;
  const outcome = streaming ? 'pending' : outcomeOf(reports, isLatest);
  const titleSource = streaming && stepTitle(streaming.text) ? streaming.text : message.content;
  const title = cleanTitle(titleSource, `Step ${number}`);
  const open = expanded || isLatest;

  // Fold a step away once a newer one arrives.
  useEffect(() => {
    if (!isLatest) setExpanded(false);
  }, [isLatest]);

  return (
    <li className="relative flex animate-fade-up gap-3.5 pb-6">
      {!isLast && <span aria-hidden className="absolute bottom-0 left-[15px] top-8 w-px bg-zinc-200 dark:bg-zinc-800" />}
      <Marker outcome={outcome} number={number} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => !isLatest && setExpanded((v) => !v)}
          className={cn('flex min-h-8 w-full items-center gap-2 text-left', !isLatest && 'group cursor-pointer')}
          aria-expanded={open}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Step {number}</span>
          <span className={cn('min-w-0 flex-1 truncate font-medium', isLatest ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100')}>
            {title}
          </span>
          {group.versions.length > 1 && (
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Updated</span>
          )}
          {!isLatest && <ChevronDown className={cn('size-4 shrink-0 text-zinc-400 transition', open && 'rotate-180')} />}
        </button>

        {open && (
          <div
            className={cn(
              'mt-2 animate-fade-up',
              isLatest && 'rounded-2xl bg-white p-4 shadow-soft ring-1 ring-zinc-200/90 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800',
            )}
          >
            {clarifications.length > 0 && <Clarifications items={clarifications} />}
            {streaming ? (
              <StreamingBody text={streaming.text} status={streaming.status} step />
            ) : (
              <>
                <Markdown text={bodyWithoutHeading(message.content)} />
                <StepActions message={message} {...actions} />
              </>
            )}
            {group.versions.length > 1 && !streaming && <EarlierVersions versions={group.versions.slice(0, -1)} />}
          </div>
        )}

        {reports.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {reports.map((r) => (
              <ReportBubble key={r.id} message={r} compact />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** An answer in a How-to, Plan or Options conversation. */
export function AnswerBlock({ message, ...actions }: ActionProps) {
  return (
    <div className="flex animate-fade-up gap-3">
      <Logo size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <Markdown text={message.content} />
        <StepActions message={message} {...actions} />
      </div>
    </div>
  );
}

/** A new reply that is being written right now. */
export function StreamingAnswer({ text, status, variant, number }: { text: string; status: string | null; variant: 'step' | 'chat'; number: number }) {
  if (variant === 'chat') {
    return (
      <div className="flex gap-3">
        <Logo size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <StreamingBody text={text} status={status} step={false} />
        </div>
      </div>
    );
  }
  const live = text ? stepTitle(text) : null;
  return (
    <li className="relative flex gap-3.5 pb-2">
      <Marker outcome="pending" number={number} />
      <div className="min-w-0 flex-1">
        <div className="flex min-h-8 items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Step {number}</span>
          <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">{live ? cleanTitle(text, '') : 'Working on it…'}</span>
        </div>
        <div className="mt-2 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-zinc-200/90 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800">
          <StreamingBody text={text} status={status} step />
        </div>
      </div>
    </li>
  );
}
