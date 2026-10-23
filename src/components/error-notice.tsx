'use client';

import { AlertTriangle, Check, ChevronDown, Copy, RotateCcw } from 'lucide-react';
import { Fragment, useState } from 'react';

import { cn } from '@/lib/client';
import { explainError, type ErrorContext } from '@/lib/errors';

/** Renders `code` spans in hint text as inline code. */
export function HintText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="rounded bg-black/5 px-1 py-px font-mono text-[0.9em] dark:bg-white/10">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** The raw error, collapsed by default, with a copy button for debugging. */
export function ErrorDetails({ raw, code, className }: { raw: string; code: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium opacity-75 hover:opacity-100"
      >
        <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
        {open ? 'Hide' : 'Show'} details
        {code && <span className="rounded bg-black/5 px-1.5 py-px font-mono text-[11px] dark:bg-white/10">{code}</span>}
      </button>
      {open && (
        <div className="relative mt-2 animate-pop-in rounded-lg bg-white/80 p-2.5 pr-9 font-mono text-[11.5px] leading-relaxed text-zinc-700 ring-1 ring-black/5 dark:bg-black/30 dark:text-zinc-300 dark:ring-white/10">
          <span className="break-all">{raw}</span>
          <button
            type="button"
            aria-label="Copy error"
            onClick={async () => {
              await navigator.clipboard.writeText(raw);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A friendly error: what happened and what to check, with the raw message
 * kept one click away so nothing is lost for debugging.
 */
export function ErrorNotice({
  error,
  context = 'general',
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  error: string;
  context?: ErrorContext;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const help = explainError(error, context);
  return (
    <div
      role="alert"
      className={cn(
        'animate-fade-up rounded-xl border border-red-200/80 bg-red-50/80 p-3.5 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200',
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{help.title}</p>
          <p className="mt-1 leading-relaxed text-red-800/90 dark:text-red-200/80">
            <HintText text={help.hint} />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
              >
                <RotateCcw className="size-3.5" /> {retryLabel}
              </button>
            )}
            <ErrorDetails raw={error} code={help.code} />
          </div>
        </div>
      </div>
    </div>
  );
}
