'use client';

import { AlertTriangle, ArrowUpRight, BookOpenText, Loader2, RefreshCw, Search, Telescope, X } from 'lucide-react';
import { useEffect } from 'react';

import { Markdown } from '@/components/markdown';
import { SourceList } from '@/components/step';
import { shortDate } from '@/lib/client';
import type { ResearchSnapshot } from '@/lib/types';

/** One line showing what the background research is doing. */
export function ResearchBar({
  research,
  canStart,
  onOpen,
  onDigDeeper,
}: {
  research: ResearchSnapshot;
  canStart: boolean;
  onOpen: () => void;
  onDigDeeper: () => void;
}) {
  if (research.status === 'idle') {
    // How-tos skip background research by default; offer it in one click.
    if (!canStart) return null;
    return (
      <button
        onClick={onDigDeeper}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-200 transition hover:text-zinc-900 hover:ring-zinc-300 dark:ring-zinc-800 dark:hover:text-zinc-100 dark:hover:ring-zinc-700"
      >
        <Telescope className="size-3.5" /> Research this in the background
      </button>
    );
  }

  if (research.status === 'running') {
    return (
      <div className="flex animate-fade-up items-center gap-3 rounded-xl bg-accent/[0.06] px-3.5 py-2.5 text-sm ring-1 ring-inset ring-accent/15">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Loader2 className="size-4 animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Researching in the background</p>
          <p className="truncate text-xs text-zinc-500">Official docs, fixes people confirmed and recent changes. Next steps will use it.</p>
        </div>
        {research.brief && (
          <button onClick={onOpen} className="shrink-0 text-xs font-medium text-accent hover:underline">
            Previous brief
          </button>
        )}
      </div>
    );
  }

  if (research.status === 'failed') {
    return (
      <div className="flex animate-fade-up items-center gap-3 rounded-xl bg-amber-500/[0.07] px-3.5 py-2.5 text-sm ring-1 ring-inset ring-amber-500/20">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">
          Background research didn&apos;t finish. Steps will search the web directly instead.
        </p>
        <button onClick={onDigDeeper} className="shrink-0 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-300">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="group flex animate-fade-up items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-zinc-200/90 dark:bg-zinc-900 dark:ring-zinc-800">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <BookOpenText className="size-4" />
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Research brief</p>
        <p className="truncate text-zinc-800 group-hover:text-zinc-950 dark:text-zinc-200 dark:group-hover:text-white">
          {research.headline ?? 'Ready. Open to read it.'}
        </p>
      </button>
      <button
        onClick={onOpen}
        className="hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 sm:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Read <ArrowUpRight className="size-3.5" />
      </button>
      <button
        onClick={onDigDeeper}
        title="Research again using everything tried so far"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <RefreshCw className="size-3.5" /> Dig deeper
      </button>
    </div>
  );
}

export function ResearchDrawer({
  research,
  onClose,
  onDigDeeper,
}: {
  research: ResearchSnapshot;
  onClose: () => void;
  onDigDeeper: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close research" className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg animate-fade-up flex-col bg-white shadow-lift dark:bg-zinc-900">
        <div className="flex items-center gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <BookOpenText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Research brief</h2>
            {research.updatedAt && (
              <p className="text-xs text-zinc-500" suppressHydrationWarning>
                Updated {shortDate(research.updatedAt)}
              </p>
            )}
          </div>
          <button
            onClick={onDigDeeper}
            disabled={research.status === 'running'}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {research.status === 'running' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Dig deeper
          </button>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {research.headline && (
            <p className="rounded-xl bg-accent/[0.07] px-4 py-3 text-sm font-medium text-zinc-800 ring-1 ring-inset ring-accent/15 dark:text-zinc-100">
              {research.headline}
            </p>
          )}
          {research.brief ? <Markdown text={research.brief} /> : <p className="text-sm text-zinc-500">No brief yet.</p>}
          {research.sources.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Sources</h3>
              <SourceList sources={research.sources} />
            </section>
          )}
          {research.queries.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Google searches</h3>
              <div className="flex flex-wrap gap-1.5">
                {research.queries.map((q) => (
                  <a
                    key={q}
                    href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <Search className="size-3" /> {q}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
