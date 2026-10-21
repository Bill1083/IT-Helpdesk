/** Request modes. Pure module: safe to import from client components. */

import type { Mode } from '@/lib/types';

export const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'fix', label: 'Fix', hint: 'Something is broken: one step at a time' },
  { key: 'howto', label: 'How-to', hint: 'How to do something, or how it works' },
  { key: 'plan', label: 'Plan', hint: 'Plan a rollout, migration or change' },
  { key: 'options', label: 'Options', hint: 'Weigh up tools or approaches' },
];

export const MODE_KEYS = MODES.map((m) => m.key) as [Mode, ...Mode[]];

export function modeLabel(mode: Mode): string {
  return MODES.find((m) => m.key === mode)?.label ?? mode;
}

const HOWTO = /^(how (do|can|to|would|should)|what('s| is| are| does)|why (does|is|do)|where (do|is|can)|can (i|we|you)|is (it|there)|explain|show me how)\b|\bhow (do|can) (i|we)\b|\bhow to\b/i;
const PLAN = /\b(plan|planning|roadmap|rollout|roll out|migrat(e|ion)|onboard(ing)? (all|every|the team)|deploy(ment)? (to|across)|project|timeline|phases?|checklist for)\b/i;
const OPTIONS = /\b(vs\.?|versus|compare|comparison|which (is|one|tool|should)|should (we|i) (use|go with|pick|choose)|options? for|alternatives? to|pros and cons|recommend(ation)? for)\b/i;

/**
 * Instant first guess so the first reply already has the right style; the
 * background classifier refines it unless the admin picked the mode.
 */
export function guessMode(text: string): Mode {
  const t = text.trim();
  if (OPTIONS.test(t)) return 'options';
  if (PLAN.test(t) && !/\b(error|broken|not working|fails?|crash)/i.test(t)) return 'plan';
  if (HOWTO.test(t) && !/\b(error|broken|not working|stopped|won't|can't|cannot|fails?|crash)/i.test(t)) return 'howto';
  return 'fix';
}
