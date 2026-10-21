import { Bandage, CheckCircle2, CircleHelp, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/client';
import { outcomeLabel } from '@/lib/outcomes';
import type { ResolutionKind } from '@/lib/types';

/** Icon and colour per closing outcome, used in the sidebar, summaries and matches. */
export const OUTCOME_STYLE: Record<ResolutionKind, { icon: LucideIcon; text: string; badge: string; solid: string }> = {
  fixed: {
    icon: CheckCircle2,
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
    solid: 'bg-emerald-500 text-white',
  },
  fixed_unknown: {
    icon: CircleHelp,
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300',
    solid: 'bg-amber-500 text-white',
  },
  workaround: {
    icon: Bandage,
    text: 'text-sky-600 dark:text-sky-400',
    badge: 'bg-sky-500/10 text-sky-800 ring-sky-500/25 dark:text-sky-300',
    solid: 'bg-sky-500 text-white',
  },
  unresolved: {
    icon: XCircle,
    text: 'text-zinc-500 dark:text-zinc-400',
    badge: 'bg-zinc-500/10 text-zinc-700 ring-zinc-500/20 dark:text-zinc-300',
    solid: 'bg-zinc-500 text-white',
  },
  done: {
    icon: CheckCircle2,
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
    solid: 'bg-emerald-500 text-white',
  },
};

export function OutcomeBadge({ kind, className }: { kind: ResolutionKind; className?: string }) {
  const style = OUTCOME_STYLE[kind];
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', style.badge, className)}>
      <Icon className="size-3.5" /> {outcomeLabel(kind)}
    </span>
  );
}
