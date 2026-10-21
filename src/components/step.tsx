'use client';

import {
  BrainCircuit,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquareShare,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { AttachmentList } from '@/components/attachments';
import { Markdown } from '@/components/markdown';
import { REPORT_LABELS, api, cn, stepTitle } from '@/lib/client';
import type { Message, Source } from '@/lib/types';

const REPORT_STYLES: Record<string, string> = {
  worked: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  error: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cant: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
};

/** The admin's side of the conversation: the original problem or a report back. */
export function UserBubble({ message }: { message: Message }) {
  const label = REPORT_LABELS[message.kind];
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
        {label && (
          <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', REPORT_STYLES[message.kind])}>
            {label}
          </span>
        )}
        {message.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.content}</p>}
        <AttachmentList attachments={message.attachments} />
      </div>
    </div>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {sources.map((s) => (
        <li key={s.url}>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex max-w-full items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="truncate">{s.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ToolbarButton({
  onClick,
  children,
  title,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

export function StepBlock({
  message,
  problemId,
  isLatest,
  canAct,
  claudeAvailable,
  retryLabel,
  onThinkHarder,
  onRetry,
}: {
  message: Message;
  problemId: string;
  isLatest: boolean;
  canAct: boolean;
  claudeAvailable: boolean;
  retryLabel: string;
  onThinkHarder: () => void;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const [showSources, setShowSources] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'working' | 'copied' | 'error'>('idle');
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const title = stepTitle(message.content) ?? message.content.split('\n')[0].slice(0, 100);
  const open = expanded || isLatest;

  // Fold a step away once a newer one arrives.
  useEffect(() => {
    if (!isLatest) setExpanded(false);
  }, [isLatest]);

  async function copyForUser() {
    setCopyState('working');
    try {
      const { text } = await api<{ text: string }>(`/api/problems/${problemId}/employee-message`, {
        method: 'POST',
        json: { messageId: message.id },
      });
      try {
        await navigator.clipboard.writeText(text);
        setCopyState('copied');
        setTimeout(() => setCopyState('idle'), 2000);
      } catch {
        setFallbackText(text);
        setCopyState('idle');
      }
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2500);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-600 transition hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        <ChevronRight className="size-4 shrink-0" />
        <span className="truncate">{title}</span>
        {message.provider === 'claude' && <BrainCircuit className="size-3.5 shrink-0 text-violet-500" />}
      </button>
    );
  }

  return (
    <div className="group">
      {!isLatest && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mb-1 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
        >
          <ChevronRight className="size-3.5 rotate-90" /> Collapse
        </button>
      )}
      {message.provider === 'claude' && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
          <BrainCircuit className="size-3.5" /> Claude
        </div>
      )}
      <Markdown text={message.content} />

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <ToolbarButton onClick={copyForUser} title="Rewrite this step as a friendly message for the employee and copy it">
          {copyState === 'working' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : copyState === 'copied' ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <MessageSquareShare className="size-3.5" />
          )}
          {copyState === 'copied' ? 'Copied for Slack' : copyState === 'error' ? 'Could not write it' : 'Copy for user'}
        </ToolbarButton>
        <ToolbarButton
          onClick={async () => {
            await navigator.clipboard.writeText(message.content);
          }}
          title="Copy this step as Markdown"
        >
          <Copy className="size-3.5" /> Copy
        </ToolbarButton>
        {message.sources.length > 0 && (
          <ToolbarButton onClick={() => setShowSources((v) => !v)} title="Web pages this step drew on">
            <ExternalLink className="size-3.5" /> Sources ({message.sources.length})
          </ToolbarButton>
        )}
        {isLatest && canAct && claudeAvailable && (
          <ToolbarButton onClick={onThinkHarder} title="Redo this step with Claude, deeper reasoning and live web search (slower)">
            <BrainCircuit className="size-3.5" /> Think harder
          </ToolbarButton>
        )}
        {isLatest && canAct && (
          <ToolbarButton onClick={onRetry} title="Get a different answer instead">
            <RotateCcw className="size-3.5" /> {retryLabel}
          </ToolbarButton>
        )}
      </div>
      {showSources && <SourceList sources={message.sources} />}
      {fallbackText && (
        <div className="mt-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="mb-2 text-xs text-zinc-500">Clipboard blocked by the browser. Select and copy:</p>
          <textarea readOnly value={fallbackText} rows={6} className="w-full resize-none bg-transparent text-sm outline-none" />
        </div>
      )}
    </div>
  );
}

/** The step currently being written. */
export function StreamingStep({ text, status }: { text: string; status: string | null }) {
  if (!text) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" />
        <span>{status ?? 'Working it out…'}</span>
      </div>
    );
  }
  return (
    <div>
      <Markdown text={text} />
      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-zinc-400 align-middle" />
    </div>
  );
}
