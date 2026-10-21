/** How a chat was closed. Pure module: safe in the browser. */

import type { ResolutionKind } from '@/lib/types';

export const FIX_OUTCOMES: { kind: ResolutionKind; label: string; placeholder: string }[] = [
  { kind: 'fixed', label: 'Fixed', placeholder: 'What fixed it, and what was causing it? (optional, saved for next time)' },
  { kind: 'fixed_unknown', label: 'Fixed, cause unknown', placeholder: 'What changed before it started working? (optional)' },
  { kind: 'workaround', label: 'Workaround', placeholder: "What's the workaround, and what's still broken? (optional)" },
  { kind: 'unresolved', label: "Couldn't fix", placeholder: 'Why are you closing it? Anything worth trying next time? (optional)' },
];

const LABELS: Record<ResolutionKind, string> = {
  fixed: 'Fixed',
  fixed_unknown: 'Fixed, cause unknown',
  workaround: 'Workaround',
  unresolved: "Couldn't fix",
  done: 'Done',
};

/** Older chats were closed before outcomes existed; they count as fixed (or done). */
export function outcomeOf(kind: ResolutionKind | null, fixMode: boolean): ResolutionKind {
  return kind ?? (fixMode ? 'fixed' : 'done');
}

export function outcomeLabel(kind: ResolutionKind): string {
  return LABELS[kind];
}

/** How a past outcome is introduced when it is shown as "seen before". */
export function outcomeLead(kind: ResolutionKind): string {
  switch (kind) {
    case 'fixed_unknown':
      return 'Fixed (cause unknown) after';
    case 'workaround':
      return 'Workaround:';
    case 'unresolved':
      return 'Not fixed. Tried:';
    default:
      return 'Fixed by:';
  }
}
