'use client';

import { AlertTriangle, BookOpenText, Loader2, RefreshCw, Search, X } from 'lucide-react';

import { Markdown } from '@/components/markdown';
import { SourceList } from '@/components/step';
import { shortDate } from '@/lib/client';
import type { ResearchSnapshot } from '@/lib/types';

/** One line under the header showing what the background research is doing. */
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
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <Search className="size-3.5" /> Research this in the background
      </button>
    );
  }

  if (research.status === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate">Researching in the background (3 searches). Next steps will use it.</span>
        {research.brief && (
          <button onClick={onOpen} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
            Previous brief
          </button>
        )}
      </div>
    );
  }

  if (research.status === 'failed') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Background research failed. Steps will search the web directly.</span>
        <button onClick={onDigDeeper} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800/70">
      <BookOpenText className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <button onClick={onOpen} className="min-w-0 flex-1 truncate text-left hover:underline">
        <span className="font-medium">Research:</span> {research.headline ?? 'brief ready'}
      </button>
      <button
        onClick={onDigDeeper}
        title="Research again using everything tried so far"
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close research" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold">Research brief</h2>
            {research.updatedAt && (
              <p className="text-xs text-zinc-500" suppressHydrationWarning>
                Updated {shortDate(research.updatedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onDigDeeper}
              disabled={research.status === 'running'}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {research.status === 'running' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Dig deeper
            </button>
            <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {research.headline && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              {research.headline}
            </p>
          )}
          {research.brief ? <Markdown text={research.brief} /> : <p className="text-sm text-zinc-500">No brief yet.</p>}
          {research.sources.length > 0 && (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sources</h3>
              <SourceList sources={research.sources} />
            </section>
          )}
          {research.queries.length > 0 && (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Google searches</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {research.queries.map((q) => (
                  <a
                    key={q}
                    href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
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
