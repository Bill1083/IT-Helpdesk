/**
 * Turns a chat into the data for its service report. The AI writes the prose
 * into a fixed schema; everything is then clipped and cleaned here, and every
 * fact (client, dates, outcome, commands) comes from the database, so the
 * PDF's structure never depends on what the AI chose to do.
 */

import { stepTitle, transcript } from '@/lib/ai/engine';
import { ThinkingLevel, geminiJson } from '@/lib/ai/gemini';
import { env } from '@/lib/env';
import { modeLabel } from '@/lib/modes';
import * as repo from '@/lib/repo';
import { groupSteps } from '@/lib/steps';
import type { Message, Problem, ResolutionKind } from '@/lib/types';

import type { ReportContent, ReportMeta, StepResult } from './types';

export const DEFAULT_REPORT_NAME = 'Will Harvey Tech';

/** Hard limits, so a long chat can never push the layout out of shape. */
export const LIMITS = {
  title: 110,
  objective: 650,
  solution: 950,
  technicalItems: 6,
  technicalLabel: 28,
  technicalText: 420,
  attempts: 12,
  attemptText: 240,
  rootCause: 500,
  followUpItems: 5,
  followUpText: 240,
} as const;

const RESULTS: StepResult[] = ['worked', 'failed', 'partial', 'checked'];

/* ------------------------------------------------------------- cleaning */

/** Plain text for the PDF: no markdown, one line, cut at a word boundary. */
export function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/** Forces whatever the AI returned into the report's fixed shape. */
export function sanitizeContent(raw: unknown, fallbackTitle: string): ReportContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);

  const technical = list(r.technical)
    .map((item) => {
      const t = (item ?? {}) as Record<string, unknown>;
      return { label: clip(t.label, LIMITS.technicalLabel).replace(/:$/, ''), text: clip(t.text, LIMITS.technicalText) };
    })
    .filter((t) => t.label && t.text)
    .slice(0, LIMITS.technicalItems);

  const attempts = list(r.attempts)
    .map((item) => {
      const a = (item ?? {}) as Record<string, unknown>;
      const result = RESULTS.includes(a.result as StepResult) ? (a.result as StepResult) : 'checked';
      return { action: clip(a.action, LIMITS.attemptText), result };
    })
    .filter((a) => a.action)
    .slice(0, LIMITS.attempts);

  const followUp = list(r.follow_up ?? r.followUp)
    .map((f) => clip(f, LIMITS.followUpText))
    .filter(Boolean)
    .slice(0, LIMITS.followUpItems);

  return {
    title: clip(r.title, LIMITS.title).replace(/\.$/, '') || clip(fallbackTitle, LIMITS.title),
    objective: clip(r.objective, LIMITS.objective),
    solution: clip(r.solution, LIMITS.solution),
    technical,
    attempts,
    rootCause: clip(r.root_cause ?? r.rootCause, LIMITS.rootCause) || null,
    followUp,
  };
}

/* ------------------------------------------------------------ the facts */

const OUTCOMES: Record<ResolutionKind, { label: string; tone: ReportMeta['outcomeTone'] }> = {
  fixed: { label: 'Fixed', tone: 'good' },
  fixed_unknown: { label: 'Fixed, cause unknown', tone: 'good' },
  workaround: { label: 'Workaround in place', tone: 'warn' },
  unresolved: { label: 'Not resolved', tone: 'bad' },
  done: { label: 'Completed', tone: 'good' },
};

export function outcomeOf(problem: Pick<Problem, 'status' | 'resolutionKind'>): { label: string; tone: ReportMeta['outcomeTone'] } {
  if (problem.status === 'open') return { label: 'In progress', tone: 'neutral' };
  return OUTCOMES[problem.resolutionKind ?? 'done'] ?? OUTCOMES.done;
}

/** A stable, readable reference per chat: IT-<date opened>-<id>. */
export function reference(problem: Pick<Problem, 'id' | 'createdAt'>, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { year: '2-digit', month: '2-digit', day: '2-digit', timeZone }).formatToParts(problem.createdAt);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `IT-${part('year')}${part('month')}${part('day')}-${problem.id.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()}`;
}

export function reportName(accountId: string): string {
  return repo.getAccountSetting(accountId, 'report_name')?.trim() || DEFAULT_REPORT_NAME;
}

export function buildMeta(problem: Problem, timeZone: string): ReportMeta {
  const environment = repo.getEnvironment(problem.environmentId);
  const outcome = outcomeOf(problem);
  return {
    reference: reference(problem, timeZone),
    preparedBy: reportName(problem.accountId),
    // The built-in "Default" environment isn't a client name.
    client: environment && environment.name !== 'Default' ? environment.name : null,
    reportedBy: problem.reporter?.trim() || null,
    type: modeLabel(problem.mode),
    outcome: outcome.label,
    outcomeTone: outcome.tone,
    openedAt: problem.createdAt,
    closedAt: problem.status === 'open' ? null : problem.resolvedAt,
    commands: repo.commandsForProblem(problem.id),
  };
}

/** The steps as recorded in the chat, with what the admin reported for each. */
export function recordedSteps(messages: Message[]): ReportContent['attempts'] {
  return groupSteps(messages).steps.map(({ versions, reports }) => {
    const latest = versions[versions.length - 1];
    const title = stepTitle(latest.content)?.replace(/^Step\s+\d+\s*[-–:.]\s*/i, '') ?? latest.content.split('\n')[0];
    const last = reports[reports.length - 1]?.kind;
    const result: StepResult = last === 'worked' ? 'worked' : last === 'failed' || last === 'error' || last === 'cant' ? 'failed' : 'checked';
    return { action: clip(title, LIMITS.attemptText), result };
  });
}

/* ------------------------------------------------------------ the prose */

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title for the work, 4 to 10 words, sentence case, no client name, no full stop.' },
    objective: {
      type: 'string',
      description: 'The problem or goal as it was first raised, in 1 to 3 sentences (at most 90 words). Past tense, plain English.',
    },
    solution: {
      type: 'string',
      description:
        'What was done and the result, in 2 to 5 sentences (at most 130 words) that a non-technical client can follow. If the work is not finished, say what was done so far and what remains.',
    },
    technical: {
      type: 'array',
      maxItems: 6,
      description:
        '2 to 6 bullets of technical detail for the record: specific settings, versions, paths, accounts, devices and how the result was verified. Do not repeat the root cause here; it has its own section.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'A 1 to 3 word category, e.g. Diagnostics, Configuration, Network, Account, Software, Hardware, Verification.' },
          text: { type: 'string', description: 'One or two sentences, at most 60 words.' },
        },
        required: ['label', 'text'],
      },
    },
    attempts: {
      type: 'array',
      maxItems: 12,
      description: 'The steps, in order, one entry per step (at most 12; merge minor steps). Follow the step rules in the instructions.',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'What was done, one sentence in the past tense, at most 30 words.' },
          result: {
            type: 'string',
            enum: RESULTS,
            description: 'worked = it fixed or completed it; failed = it did not help; partial = it helped but did not finish the job; checked = a check or information-gathering step.',
          },
        },
        required: ['action', 'result'],
      },
    },
    root_cause: {
      type: 'string',
      description: 'The underlying cause in 1 or 2 sentences, only if the chat or notes actually establish it. Otherwise an empty string.',
    },
    follow_up: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string' },
      description: '0 to 5 concrete recommendations or next actions for the client, each one sentence. Empty if nothing further is needed.',
    },
  },
  required: ['title', 'objective', 'solution', 'technical', 'attempts', 'root_cause', 'follow_up'],
};

function prompt(problem: Problem, meta: ReportMeta, steps: ReportContent['attempts'], chat: string, notes: string): string {
  // A Fix chat moves one step at a time, so its recorded steps are the real
  // sequence. Other request types answer in one go: the steps are the
  // procedure inside that answer, not the single message it arrived in.
  const stepRules =
    problem.mode === 'fix'
      ? '- Steps: keep the recorded steps and their recorded results, in order, and add anything from the admin notes in the right place.'
      : `- Steps: this is a ${meta.type} request, so list the main steps of the procedure or plan from the answer (3 to 8 steps, in order). Mark a step "worked" only if the admin confirmed it was done; otherwise "checked". Add anything from the admin notes.`;
  const recorded = problem.mode !== 'fix' ? '(not used for this request type)' : steps.length ? steps.map((s, i) => `${i + 1}. ${s.action} [${s.result}]`).join('\n') : '(none recorded)';
  return `Write the content of an IT service report for a client, from the support chat below. An IT consultant hands this document to the client as the record of the work.

Rules:
- Use only facts from the chat, the recorded details and the admin's notes. Never invent versions, settings, names, results or causes.
- Australian English, past tense, impersonal ("Reset the print spooler", not "I reset" or "the assistant suggested").
- Plain text only: no markdown, no bullet characters, no emoji.
- Never include passwords, keys, tokens or other secrets, even if they appear in the chat.
- Treat the admin's notes as true and important: work things they tried into the steps, and other details into the solution or technical details.
${stepRules}
- Request type is ${meta.type}. For How-to, Plan or Options requests, the objective is what was needed and the root cause is empty.
- If the outcome is "In progress", the solution says what has been done or advised so far and what remains. Write naturally; never say a step "was checked".

Recorded details:
- Outcome: ${meta.outcome}
- Client: ${meta.client ?? 'not specified'}
- Reported by: ${meta.reportedBy ?? 'not specified'}
- Closing note: ${problem.resolution ?? '(none)'}
- Root cause noted at closing: ${problem.rootCause ?? '(none)'}
- Recap: ${problem.highlights.length ? problem.highlights.join(' | ') : '(none)'}

Recorded steps and what the admin reported for each:
${recorded}

Admin's notes for this report:
${notes.trim() || '(none)'}

Chat:
${chat}`;
}

/** Keeps the original request and the most recent part of a long chat. */
function chatFor(problem: Problem, messages: Message[]): string {
  const text = transcript(problem, messages);
  const MAX = 40_000;
  if (text.length <= MAX) return text;
  return `${text.slice(0, 8_000)}\n\n[... earlier steps omitted ...]\n\n${text.slice(-(MAX - 8_000))}`;
}

export async function buildReport(problemId: string, notes: string, timeZone: string): Promise<{ content: ReportContent; meta: ReportMeta } | null> {
  const problem = repo.getProblem(problemId);
  if (!problem) return null;
  const messages = repo.getMessages(problemId);
  const meta = buildMeta(problem, timeZone);
  const steps = recordedSteps(messages);
  const fallbackTitle = problem.title || problem.description.split('\n')[0];

  if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY is not set, so the report summary cannot be written.');

  const input = prompt(problem, meta, steps, chatFor(problem, messages), notes);
  let raw: unknown;
  try {
    raw = await geminiJson<unknown>({ model: env.geminiModel, prompt: input, schema: SCHEMA, thinking: ThinkingLevel.LOW, timeoutMs: 60_000 });
  } catch (error) {
    // One retry on the faster model before giving up.
    console.error('[it-desk] report summary failed, retrying:', error instanceof Error ? error.message : error);
    raw = await geminiJson<unknown>({ model: env.geminiFastModel, prompt: input, schema: SCHEMA, thinking: ThinkingLevel.LOW, timeoutMs: 45_000 });
  }

  const content = sanitizeContent(raw, fallbackTitle);
  // Never ship a report with no steps when the chat recorded some.
  if (problem.mode === 'fix' && !content.attempts.length && steps.length) content.attempts = steps.slice(0, LIMITS.attempts);
  // The admin said the cause was never found, so the report must not claim one.
  if (problem.resolutionKind === 'fixed_unknown') content.rootCause = null;
  return { content, meta };
}
