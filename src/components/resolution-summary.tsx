'use client';

import { ChevronDown, ListChecks, RotateCcw, Search } from 'lucide-react';

import { OUTCOME_STYLE, OutcomeBadge } from '@/components/outcome';
import { OutcomeChip } from '@/components/step';
import { cn, shortDate, stepTitle } from '@/lib/client';
import { outcomeOf } from '@/lib/outcomes';
import type { StepGroup } from '@/lib/steps';
import type { Problem } from '@/lib/types';

function titleOf(content: string, number: number): string {
  const raw = stepTitle(content) ?? content.split('\n').find((l) => l.trim())?.replace(/[*#_`]/g, '').trim() ?? `Step ${number}`;
  return raw.replace(/^step\s*\d+\s*[-–—:.]\s*/i, '').slice(0, 110);
}

/**
 * What a closed chat comes down to: the outcome, the cause (or that it was
 * never found), a short recap and the steps taken. The full conversation is
 * one click away.
 */
export function ResolutionSummary({
  problem,
  steps,
  showingAll,
  onToggle,
  onReopen,
}: {
  problem: Problem;
  steps: StepGroup[];
  showingAll: boolean;
  onToggle: () => void;
  onReopen: () => void;
}) {
  const fixing = problem.mode === 'fix';
  const kind = outcomeOf(problem.resolutionKind, fixing);
  const style = OUTCOME_STYLE[kind];
  const Icon = style.icon;
  const causeMissing = fixing && !problem.rootCause && kind !== 'unresolved';

  return (
    <section className="animate-fade-up overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-zinc-200/90 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', style.solid)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <OutcomeBadge kind={kind} />
          {problem.resolvedAt && (
            <span className="ml-2 text-xs text-zinc-400" suppressHydrationWarning>
              {shortDate(problem.resolvedAt)}
            </span>
          )}
        </div>
        <button
          onClick={onReopen}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <RotateCcw className="size-3.5" /> Reopen
        </button>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {problem.resolution && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {kind === 'unresolved' ? 'Where it was left' : kind === 'workaround' ? 'Workaround' : fixing ? 'What fixed it' : 'Outcome'}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">{problem.resolution}</p>
          </div>
        )}

        {fixing && (
          <div className="flex gap-2.5 rounded-xl bg-zinc-50 px-3.5 py-2.5 text-sm ring-1 ring-inset ring-zinc-200/70 dark:bg-zinc-950/40 dark:ring-zinc-800">
            <Search className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <p className="text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Cause: </span>
              {problem.rootCause ? problem.rootCause : causeMissing ? <span className="italic text-zinc-500">never found</span> : <span className="italic text-zinc-500">not established</span>}
            </p>
          </div>
        )}

        {problem.highlights.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Recap</p>
            <ul className="mt-1.5 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {problem.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-zinc-400" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fixing && steps.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <ListChecks className="size-3.5" /> Steps taken
            </p>
            <ol className="mt-1.5 divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200/70 dark:divide-zinc-800 dark:ring-zinc-800">
              {steps.map((s, i) => {
                const current = s.versions[s.versions.length - 1];
                const report = s.reports.find((r) => ['worked', 'failed', 'error', 'cant'].includes(r.kind));
                return (
                  <li key={current.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{titleOf(current.content, i + 1)}</span>
                    {s.versions.length > 1 && <span className="shrink-0 text-[11px] text-zinc-400">updated</span>}
                    {report && <OutcomeChip kind={report.kind} />}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      <button
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
      >
        {showingAll ? 'Hide the full conversation' : 'Show the full conversation'}
        <ChevronDown className={cn('size-4 transition', showingAll && 'rotate-180')} />
      </button>
    </section>
  );
}
