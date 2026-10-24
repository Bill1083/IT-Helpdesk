import fs from 'node:fs';

import Anthropic from '@anthropic-ai/sdk';
import { ApiError, type Content, type Part } from '@google/genai';

import { captureCommands } from '@/lib/ai/capture';
import { streamClaude } from '@/lib/ai/claude';
import { ThinkingLevel, geminiEmbed, geminiGrounded, geminiJson, geminiText, streamGemini } from '@/lib/ai/gemini';
import { env } from '@/lib/env';
import { PLAYBOOKS, playbooksFor, routePlaybooks } from '@/lib/playbooks';
import {
  CLASSIFY_SCHEMA,
  DEFAULT_ABOUT,
  RELEVANCE_SCHEMA,
  RESOLUTION_SCHEMA,
  SYNTHESIS_SCHEMA,
  buildSystemPrompt,
  classifyPrompt,
  problemBlock,
  relevancePrompt,
  reportText,
  researchAngles,
  researchPrompt,
  resolutionPrompt,
  synthesisPrompt,
  turnContext,
  userMessagePrompt,
} from '@/lib/prompts';
import * as repo from '@/lib/repo';
import { groupSteps, isRevising } from '@/lib/steps';
import type {
  Attachment,
  Message,
  Mode,
  Problem,
  ResolutionKind,
  Provider,
  RelatedMatch,
  ReportKind,
  SimilarProblem,
  Source,
  StreamEvent,
} from '@/lib/types';

const FAIL_KINDS = new Set(['failed', 'error', 'cant']);

export function aiStatus() {
  return {
    gemini: Boolean(env.geminiApiKey),
    claude: Boolean(env.anthropicApiKey),
    geminiModel: env.geminiModel,
    claudeModel: env.anthropicModel,
  };
}

/** The account's own background, shared across its client environments. */
export function aboutProfile(accountId: string): string {
  return repo.getAccountSetting(accountId, 'about') ?? DEFAULT_ABOUT;
}

/* ---------------------------------------------------------------- utils */

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

function clean(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function describeError(error: unknown): string {
  let message: string;
  if (error instanceof Anthropic.APIError) message = `Claude API error ${error.status ?? ''}: ${error.message}`;
  else if (error instanceof ApiError) message = `Gemini API error ${error.status}: ${error.message}`;
  else if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) message = 'The AI took too long to answer. Try again.';
  else message = error instanceof Error ? error.message : 'Unknown error';
  // Never echo a key back to the browser.
  return message.replace(/(key=|sk-ant-|AIza)[\w-]+/g, '$1…').slice(0, 400);
}

/** "### Step 2 - Clear the cache" -> "Step 2 - Clear the cache". */
export function stepTitle(content: string): string | null {
  const match = content.match(/^#{2,4}\s*(.+)$/m);
  return match ? match[1].replace(/\*\*/g, '').trim() : null;
}

function transcript(problem: Problem, messages: Message[]): string {
  return messages
    .map((m) =>
      m.role === 'assistant'
        ? `ASSISTANT:\n${m.content}`
        : `ADMIN:\n${m.kind === 'start' ? problem.description : reportText(m.kind, m.content)}`,
    )
    .join('\n\n');
}

/* ------------------------------------------------- conversation assembly */

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  images: Attachment[];
}

function readUpload(attachment: Attachment): Buffer | null {
  const file = repo.uploadPath(attachment.name);
  if (!file) return null;
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

function textAttachments(attachments: Attachment[]): string {
  return attachments
    .filter((a) => a.kind === 'text')
    .map((a) => {
      const body = readUpload(a)?.toString('utf8');
      return body ? `\n\nAttached file "${a.original}":\n\`\`\`\n${body}\n\`\`\`` : '';
    })
    .join('');
}

function buildTurns(
  problem: Problem,
  messages: Message[],
  similar: SimilarProblem[],
  environmentName: string | null,
  context: string,
): Turn[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const turns: Turn[] = [];
  messages.forEach((m, index) => {
    if (m.role === 'assistant') {
      turns.push({ role: 'assistant', text: m.content, images: [] });
      return;
    }
    // Images ride along on the opening message and the latest report only:
    // replies to older ones already describe what they showed, and re-sending
    // every screenshot on every step makes each step slower.
    const keep = m.kind === 'start' || index === lastUser;
    const base = m.kind === 'start' ? problemBlock(problem, similar, environmentName) : reportText(m.kind, m.content);
    const images = m.attachments.filter((a) => a.kind === 'image');
    const text =
      base +
      (keep ? textAttachments(m.attachments) : m.attachments.length ? `\n[${m.attachments.length} attachment(s) shared earlier]` : '');
    turns.push({ role: 'user', text, images: keep ? images : [] });
  });

  const last = turns[turns.length - 1];
  if (last?.role === 'user') last.text += `\n\n${context}`;
  else turns.push({ role: 'user', text: context, images: [] });

  // Two reports in a row (e.g. after a failed reply) become one turn.
  const merged: Turn[] = [];
  for (const turn of turns) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.text += `\n\n${turn.text}`;
      prev.images.push(...turn.images);
    } else merged.push({ ...turn, images: [...turn.images] });
  }
  return merged;
}

function toGeminiContents(turns: Turn[]): Content[] {
  return turns.map((turn) => {
    const parts: Part[] = [];
    for (const image of turn.images) {
      const bytes = readUpload(image);
      if (bytes) parts.push({ inlineData: { mimeType: image.mime, data: bytes.toString('base64') } });
    }
    parts.push({ text: turn.text });
    return { role: turn.role === 'assistant' ? 'model' : 'user', parts };
  });
}

type ClaudeImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

function toClaudeMessages(turns: Turn[]): Anthropic.Beta.BetaMessageParam[] {
  return turns.map((turn) => {
    if (turn.role === 'assistant') return { role: 'assistant', content: turn.text };
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const image of turn.images) {
      const bytes = readUpload(image);
      if (bytes) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mime as ClaudeImageType, data: bytes.toString('base64') },
        });
      }
    }
    content.push({ type: 'text', text: turn.text });
    return { role: 'user', content };
  });
}

/* ------------------------------------------------------ similar problems */

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * "Seen before" only shows matches the AI judged relevant (they carry a reason).
 * Live keyword suggestions while typing pass requireReason: false.
 */
export function similarFromMatches(matches: RelatedMatch[], { requireReason = true } = {}): SimilarProblem[] {
  const judged = requireReason ? matches.filter((m) => m.reason) : matches;
  if (judged.length === 0) return [];
  const byId = new Map(repo.getProblems(judged.map((m) => m.id)).map((p) => [p.id, p]));
  const envIds = new Set([...byId.values()].map((p) => p.environmentId).filter((v): v is string => Boolean(v)));
  const envNames = new Map([...envIds].map((envId) => [envId, repo.getEnvironment(envId)?.name ?? null]));
  return judged.flatMap((m) => {
    const p = byId.get(m.id);
    if (!p) return [];
    return [
      {
        id: p.id,
        title: p.title,
        summary: p.summary,
        description: p.description.slice(0, 400),
        resolution: p.resolution,
        reporter: p.reporter,
        environmentName: p.environmentId ? (envNames.get(p.environmentId) ?? null) : null,
        status: p.status,
        resolutionKind: p.resolutionKind,
        createdAt: p.createdAt,
        score: m.score,
        reason: m.reason ?? null,
      },
    ];
  });
}

/**
 * One cheap call (the fast model, minimal thinking) checks every candidate at
 * once and keeps only the ones that would genuinely help, with a reason.
 */
async function judgeRelevance(problem: Problem, candidates: { match: RelatedMatch; past: Problem }[]): Promise<RelatedMatch[]> {
  const out = await geminiJson<{ matches?: { index: number; relevant: boolean; reason?: string }[] }>({
    model: env.geminiFastModel,
    prompt: relevancePrompt(
      problem.description,
      candidates.map(({ past }, index) => ({
        index,
        text: [
          past.title ?? past.description.slice(0, 120),
          past.summary ?? past.description.slice(0, 400),
          past.resolution ? `Outcome: ${past.resolution}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      })),
    ),
    schema: RELEVANCE_SCHEMA,
    thinking: ThinkingLevel.MINIMAL,
    timeoutMs: 6_000,
  });
  return (out.matches ?? [])
    .filter((m) => m.relevant && candidates[m.index] && clean(m.reason, 160))
    .map((m) => ({ ...candidates[m.index].match, reason: clean(m.reason, 160)! }))
    .slice(0, 2);
}

/**
 * Embed the new problem and compare it with every past one (a few thousand
 * vectors compare in well under a millisecond, so no vector DB), then let the
 * AI judge the closest few. Nothing is shown unless it is judged relevant.
 */
export async function findSimilar(problem: Problem): Promise<SimilarProblem[]> {
  let matches: RelatedMatch[] = [];
  try {
    if (env.geminiApiKey) {
      const vector = await geminiEmbed(problem.description);
      repo.setEmbedding(problem.id, vector);
      const nearest = repo
        .allEmbeddings(problem.id, problem.accountId)
        .filter((e) => e.vector.length === vector.length)
        .map((e) => ({ id: e.id, score: Math.round(cosine(vector, e.vector) * 1000) / 1000 }))
        .filter((m) => m.score >= env.similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const byId = new Map(repo.getProblems(nearest.map((m) => m.id)).map((p) => [p.id, p]));
      const candidates = nearest.flatMap((match) => {
        const past = byId.get(match.id);
        return past ? [{ match, past }] : [];
      });
      if (candidates.length) matches = await judgeRelevance(problem, candidates);
    }
  } catch (error) {
    // Better no banner than an irrelevant one.
    console.error('[it-desk] past-problem matching failed:', describeError(error));
    matches = [];
  }
  repo.updateProblem(problem.id, { related: matches }, false);
  return similarFromMatches(matches);
}

/* --------------------------------------------------------- classification */

export async function classify(problem: Problem): Promise<Problem | null> {
  if (!env.geminiApiKey) return null;
  try {
    const out = await geminiJson<{ title?: string; summary?: string; categories?: string[]; mode?: Mode }>({
      model: env.geminiFastModel,
      prompt: classifyPrompt(problem.description),
      schema: CLASSIFY_SCHEMA,
      thinking: ThinkingLevel.MINIMAL,
      timeoutMs: 15_000,
    });
    const valid = new Set(PLAYBOOKS.map((p) => p.key));
    const categories = (out.categories ?? []).filter((c) => valid.has(c)).slice(0, 2);
    const modes: Mode[] = ['fix', 'howto', 'plan', 'options'];
    // Re-read so a mode the admin picked meanwhile is not overwritten.
    const current = repo.getProblem(problem.id) ?? problem;
    return repo.updateProblem(
      problem.id,
      {
        title: clean(out.title, 90) ?? current.title,
        summary: clean(out.summary, 400) ?? current.summary,
        categories: categories.length ? categories : current.categories,
        mode: !current.modeLocked && out.mode && modes.includes(out.mode) ? out.mode : undefined,
      },
      false,
    );
  } catch (error) {
    console.error('[it-desk] classify failed:', describeError(error));
    return null;
  }
}

/* --------------------------------------------------------------- research */

const runningResearch = new Set<string>();

function researchContext(problem: Problem, messages: Message[]): string {
  const tried: string[] = [];
  let lastStep: string | null = null;
  for (const m of messages) {
    if (m.role === 'assistant') lastStep = stepTitle(m.content) ?? m.content.slice(0, 120);
    else if (m.kind !== 'start' && m.kind !== 'clarify' && lastStep) {
      tried.push(`- ${lastStep} -> ${reportText(m.kind, m.content).replace(/\n+/g, ' ').slice(0, 300)}`);
      lastStep = null;
    }
  }
  const environment = repo.getEnvironment(problem.environmentId);
  return [
    `# Request (logged ${new Date(problem.createdAt).toISOString().slice(0, 10)})`,
    problem.description.slice(0, 4000),
    '',
    `# Client environment${environment ? `: ${environment.name}` : ''}`,
    environment?.profile || 'Not recorded.',
    ...(tried.length ? ['', '# Already tried', ...tried] : []),
  ].join('\n');
}

/**
 * Background research: three grounded searches from different angles run in
 * parallel, then one call merges them into a short brief. Later steps read the
 * brief instead of searching again, which is what keeps them fast.
 */
export function startResearch(problemId: string): boolean {
  if (!env.geminiApiKey || runningResearch.has(problemId)) return false;
  runningResearch.add(problemId);
  repo.updateProblem(problemId, { researchStatus: 'running' }, false);
  void runResearch(problemId).finally(() => runningResearch.delete(problemId));
  return true;
}

async function runResearch(problemId: string): Promise<void> {
  try {
    const problem = repo.getProblem(problemId);
    if (!problem) return;
    const context = researchContext(problem, repo.getMessages(problemId));
    const keys = problem.categories.length ? problem.categories : routePlaybooks(problem.description);
    const preferred = Array.from(new Set(playbooksFor(keys).flatMap((p) => p.sources)));

    const settled = await Promise.allSettled(
      researchAngles(problem.mode).map(async (angle) => ({
        angle,
        ...(await geminiGrounded({
          model: env.geminiResearchModel,
          prompt: researchPrompt(angle, context, preferred),
          thinking: ThinkingLevel.LOW,
          timeoutMs: 60_000,
        })),
      })),
    );
    const findings = settled.flatMap((r) => (r.status === 'fulfilled' && r.value.text.trim() ? [r.value] : []));
    if (!findings.length) {
      const reason = settled.find((r) => r.status === 'rejected');
      throw reason?.status === 'rejected' ? reason.reason : new Error('Every research search came back empty.');
    }

    let headline: string | null = null;
    let brief: string;
    try {
      const out = await geminiJson<{ headline?: string; brief?: string }>({
        model: env.geminiResearchModel,
        prompt: synthesisPrompt(problem.mode, context, findings.map((f) => ({ label: f.angle.label, text: f.text }))),
        schema: SYNTHESIS_SCHEMA,
        thinking: ThinkingLevel.MEDIUM,
        timeoutMs: 60_000,
      });
      headline = clean(out.headline, 300);
      brief = clean(out.brief, 6000) ?? findings.map((f) => `## ${f.angle.label}\n${f.text}`).join('\n\n');
    } catch (error) {
      console.error('[it-desk] research synthesis failed, keeping raw findings:', describeError(error));
      brief = findings.map((f) => `## ${f.angle.label}\n${f.text}`).join('\n\n');
    }

    repo.updateProblem(
      problemId,
      {
        researchStatus: 'ready',
        researchHeadline: headline,
        researchBrief: brief,
        researchSources: dedupeSources(findings.flatMap((f) => f.sources)).slice(0, 20),
        researchQueries: Array.from(new Set(findings.flatMap((f) => f.queries))).slice(0, 12),
        researchUpdatedAt: Date.now(),
      },
      false,
    );
  } catch (error) {
    console.error('[it-desk] research failed:', describeError(error));
    repo.updateProblem(problemId, { researchStatus: 'failed' }, false);
  }
}

/* ------------------------------------------------------------ step stream */

export interface TurnOptions {
  report?: { kind: ReportKind; content: string; attachments: Attachment[] };
  /** Replace the last reply (or retry after an error) instead of adding a report. */
  regenerate?: boolean;
  provider: Provider;
  /** Force live web search even when a research brief exists. */
  search?: boolean;
  signal?: AbortSignal;
}

/**
 * Replies being written right now. Leaving a chat doesn't stop the reply (the
 * server finishes and saves it), so a reopened chat reads this to rejoin it live.
 */
const liveTurns = new Map<string, { text: string; status: string | null; startedAt: number }>();
const LIVE_STALE_MS = 5 * 60 * 1000;

export function liveTurn(problemId: string): { text: string; status: string | null } | null {
  const live = liveTurns.get(problemId);
  return live && Date.now() - live.startedAt < LIVE_STALE_MS ? { text: live.text, status: live.status } : null;
}

export async function* streamTurn(problemId: string, opts: TurnOptions): AsyncGenerator<StreamEvent> {
  // One reply at a time per chat, so two tabs can't create duplicate steps.
  if (liveTurn(problemId)) {
    yield { type: 'error', message: 'Still writing the previous reply. It will appear here in a moment.' };
    return;
  }
  const live = { text: '', status: 'Starting…' as string | null, startedAt: Date.now() };
  liveTurns.set(problemId, live);
  try {
    for await (const event of turnEvents(problemId, opts)) {
      if (event.type === 'status') live.status = event.text;
      else if (event.type === 'delta') live.text += event.text;
      yield event;
    }
  } finally {
    if (liveTurns.get(problemId) === live) liveTurns.delete(problemId);
  }
}

async function* turnEvents(problemId: string, opts: TurnOptions): AsyncGenerator<StreamEvent> {
  let problem = repo.getProblem(problemId);
  if (!problem) {
    yield { type: 'error', message: 'Problem not found.' };
    return;
  }
  if (opts.provider === 'claude' && !env.anthropicApiKey) {
    yield { type: 'error', message: 'Add ANTHROPIC_API_KEY to .env to use Think harder.' };
    return;
  }
  if (opts.provider === 'gemini' && !env.geminiApiKey) {
    yield { type: 'error', message: 'Add GEMINI_API_KEY to .env to get steps.' };
    return;
  }

  let messages = repo.getMessages(problemId);
  if (opts.regenerate) {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      repo.deleteMessage(last.id);
      messages = messages.slice(0, -1);
    }
  } else if (opts.report) {
    repo.addMessage({ problemId, role: 'user', ...opts.report });
    messages = repo.getMessages(problemId);
    if (problem.status === 'resolved') repo.updateProblem(problemId, { status: 'open', resolvedAt: null });
  }

  const isFirst = !messages.some((m) => m.role === 'assistant');
  let similar: SimilarProblem[];
  let classifying: Promise<Problem | null> | null = null;

  if (isFirst && !opts.regenerate) {
    yield { type: 'status', text: 'Checking your past problems…' };
    // Matching first: a past fix is the fastest step there is.
    similar = await withTimeout(findSimilar(problem), 5000, []);
    if (similar.length) yield { type: 'similar', items: similar };
    classifying = classify(problem);
    // A quick how-to is answered with live search; background research is for
    // problems, plans and decisions (and still one click away for a how-to).
    if (problem.mode !== 'howto' && startResearch(problemId)) yield { type: 'research', status: 'running' };
  } else {
    similar = similarFromMatches(problem.related);
  }

  // Two misses in a row: re-research with everything tried so far.
  if (!isFirst && opts.report && FAIL_KINDS.has(opts.report.kind)) {
    const reports = messages.filter((m) => m.role === 'user' && m.kind !== 'start' && m.kind !== 'clarify').slice(-2);
    if (reports.length === 2 && reports.every((m) => FAIL_KINDS.has(m.kind)) && startResearch(problemId)) {
      yield { type: 'research', status: 'running' };
    }
  }

  problem = repo.getProblem(problemId)!;
  const environment = repo.getEnvironment(problem.environmentId);
  // A question about the current step revises it; anything else moves on.
  const revising = problem.mode === 'fix' && isRevising(messages);
  const stepCount = groupSteps(messages).steps.length;
  const stepNumber = revising ? stepCount : stepCount + 1;
  const ready = problem.researchStatus === 'ready';
  const context = turnContext({
    mode: problem.mode,
    modeLocked: problem.modeLocked,
    stepNumber,
    revising,
    researchBrief: ready ? problem.researchBrief : null,
    researching: problem.researchStatus === 'running',
  });
  const system = buildSystemPrompt({ about: aboutProfile(problem.accountId), environment, categories: problem.categories });
  const turns = buildTurns(problem, messages, similar, environment?.name ?? null, context);
  const search = Boolean(opts.search) || !ready;

  yield {
    type: 'status',
    text: opts.provider === 'claude' ? 'Claude is thinking…' : search ? 'Working it out (web search on)…' : 'Working it out…',
  };

  let text = '';
  let sources: Source[] = [];
  const model = opts.provider === 'claude' ? env.anthropicModel : env.geminiModel;
  try {
    if (opts.provider === 'claude') {
      for await (const chunk of streamClaude({ system, messages: toClaudeMessages(turns), signal: opts.signal })) {
        if (chunk.type === 'text') {
          text += chunk.text;
          yield { type: 'delta', text: chunk.text };
        } else if (chunk.type === 'status') {
          yield chunk;
        } else {
          sources.push(...chunk.items);
        }
      }
    } else {
      for await (const chunk of streamGemini({
        model,
        system,
        contents: toGeminiContents(turns),
        search,
        thinking: ThinkingLevel.LOW,
        signal: opts.signal,
      })) {
        if (chunk.type === 'text') {
          text += chunk.text;
          yield { type: 'delta', text: chunk.text };
        } else {
          sources.push(...chunk.sources);
        }
      }
    }
  } catch (error) {
    if (opts.signal?.aborted) return;
    yield { type: 'error', message: describeError(error) };
    return;
  }

  if (!text.trim()) {
    yield { type: 'error', message: 'The AI returned an empty reply. Try again.' };
    return;
  }
  sources = dedupeSources(sources).slice(0, 8);
  if (sources.length) yield { type: 'sources', items: sources };

  const message = repo.addMessage({
    problemId,
    role: 'assistant',
    kind: 'step',
    content: text.trim(),
    provider: opts.provider,
    model,
    sources,
  });
  // Off the critical path: the step is already on screen.
  void captureCommands(problem, message).catch((error) =>
    console.error('[it-desk] saving commands failed:', describeError(error)),
  );

  if (classifying) {
    const updated = await withTimeout(classifying, 2500, null);
    if (updated) {
      yield { type: 'meta', title: updated.title, categories: updated.categories, summary: updated.summary, mode: updated.mode };
    }
  }
  yield { type: 'done', message };
}

/* ------------------------------------------------------------- resolution */

export async function resolveProblem(problemId: string, note: string, outcome: ResolutionKind): Promise<Problem | null> {
  const problem = repo.getProblem(problemId);
  if (!problem) return null;
  // "Fixed" means the last step worked, so it marks that step green.
  repo.addMessage({ problemId, role: 'user', kind: outcome === 'fixed' ? 'worked' : 'closed', content: note.trim() });
  const messages = repo.getMessages(problemId);

  let resolution = clean(note, 1000);
  let rootCause: string | null = null;
  let summary = problem.summary;
  let highlights: string[] = [];
  if (env.geminiApiKey) {
    try {
      const out = await geminiJson<{ resolution?: string; root_cause?: string; summary?: string; highlights?: string[] }>({
        model: env.geminiFastModel,
        prompt: resolutionPrompt(transcript(problem, messages), note, outcome),
        schema: RESOLUTION_SCHEMA,
        thinking: ThinkingLevel.LOW,
        timeoutMs: 20_000,
      });
      resolution = clean(out.resolution, 1000) ?? resolution;
      rootCause = outcome === 'unresolved' || outcome === 'done' ? null : clean(out.root_cause, 400);
      summary = clean(out.summary, 400) ?? summary;
      highlights = (out.highlights ?? []).map((h) => clean(h, 200)).filter((h): h is string => Boolean(h)).slice(0, 5);
    } catch (error) {
      console.error('[it-desk] resolution summary failed:', describeError(error));
    }
  }
  return repo.updateProblem(problemId, {
    status: 'resolved',
    resolvedAt: Date.now(),
    resolution,
    resolutionKind: outcome,
    rootCause,
    summary,
    highlights,
  });
}

/** A friendly Slack-ready version of one step for the employee. */
export async function employeeMessage(problemId: string, messageId: number): Promise<string | null> {
  const problem = repo.getProblem(problemId);
  const message = repo.getMessage(messageId);
  if (!problem || !message || message.problemId !== problemId) return null;
  if (!env.geminiApiKey) return message.content;
  return geminiText({
    model: env.geminiFastModel,
    prompt: userMessagePrompt(message.content, problem.reporter),
    thinking: ThinkingLevel.LOW,
    timeoutMs: 20_000,
  });
}
