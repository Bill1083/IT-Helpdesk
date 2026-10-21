/**
 * How a Fix conversation divides into steps. Pure module, shared by the
 * server (step numbering) and the browser (the stepper).
 *
 * An outcome report ("didn't work") moves on to the next step. A question or
 * extra detail about the current step ("clarify") makes the next reply a new
 * version of the same step instead.
 */

import type { Message } from '@/lib/types';

export interface StepGroup {
  /** Every version of this step, oldest first; the last one is current. */
  versions: Message[];
  /** Questions or details the admin added that led to newer versions. */
  clarifications: Message[];
  /** Outcome reports on the step (worked, didn't work, ...). */
  reports: Message[];
}

export function groupSteps(messages: Message[]): { steps: StepGroup[]; loose: Message[] } {
  const steps: StepGroup[] = [];
  const loose: Message[] = [];
  let revising = false;
  for (const m of messages) {
    if (m.kind === 'start') continue;
    const current = steps[steps.length - 1];
    if (m.role === 'assistant') {
      if (revising && current) current.versions.push(m);
      else steps.push({ versions: [m], clarifications: [], reports: [] });
      revising = false;
    } else if (!current) {
      loose.push(m);
    } else if (m.kind === 'clarify') {
      current.clarifications.push(m);
      revising = true;
    } else {
      current.reports.push(m);
      revising = false;
    }
  }
  return { steps, loose };
}

/** True when the next reply should revise the current step rather than add one. */
export function isRevising(messages: Message[]): boolean {
  const last = messages[messages.length - 1];
  return Boolean(last && last.role === 'user' && last.kind === 'clarify' && messages.some((m) => m.role === 'assistant'));
}
