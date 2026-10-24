import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { groupSteps, isRevising } from '@/lib/steps';
import type { Message } from '@/lib/types';

// A throwaway database; no API keys, so nothing calls an AI.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ithd-flow-'));
process.env.DATA_DIR = dir;
delete process.env.GEMINI_API_KEY;

afterAll(() => {
  globalThis.__ithdDb?.close();
  globalThis.__ithdDb = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

let nextId = 1;
const msg = (role: Message['role'], kind: string, content = ''): Message => ({
  id: nextId++,
  problemId: 'p',
  role,
  kind,
  content,
  attachments: [],
  provider: null,
  model: null,
  sources: [],
  createdAt: Date.now(),
});

describe('step grouping', () => {
  it('a question revises the current step; a result moves on', () => {
    const messages = [
      msg('user', 'start', 'Teams crashes'),
      msg('assistant', 'step', '### Step 1 - Clear cache'),
      msg('user', 'clarify', 'Is this new Teams or classic?'),
      msg('assistant', 'step', '### Step 1 - Clear the new Teams cache'),
      msg('user', 'failed', 'Still crashes'),
      msg('assistant', 'step', '### Step 2 - Reinstall'),
    ];
    const { steps } = groupSteps(messages);
    expect(steps).toHaveLength(2);
    expect(steps[0].versions).toHaveLength(2);
    expect(steps[0].clarifications.map((m) => m.content)).toEqual(['Is this new Teams or classic?']);
    expect(steps[0].reports.map((m) => m.kind)).toEqual(['failed']);
    expect(steps[1].versions).toHaveLength(1);
  });

  it('knows when the next reply should revise rather than add a step', () => {
    const base = [msg('user', 'start'), msg('assistant', 'step')];
    expect(isRevising([...base, msg('user', 'clarify', 'why?')])).toBe(true);
    expect(isRevising([...base, msg('user', 'failed')])).toBe(false);
    expect(isRevising([msg('user', 'start')])).toBe(false);
  });
});

describe('closing and matching', () => {
  const make = async (description: string) => {
    const repo = await import('@/lib/repo');
    const { problem } = repo.createProblem({
      accountId: repo.OWNER_ID,
      description,
      reporter: null,
      attachments: [],
      environmentId: null,
      mode: 'fix',
      modeLocked: false,
      categories: [],
    });
    repo.addMessage({ problemId: problem.id, role: 'assistant', kind: 'step', content: '### Step 1 - Restart' });
    return problem;
  };

  it('records "fixed, cause unknown" without inventing a cause', async () => {
    const { resolveProblem } = await import('@/lib/ai/engine');
    const repo = await import('@/lib/repo');
    const p = await make('Printer offline for the whole office');
    const resolved = await resolveProblem(p.id, 'Came back after the router restart', 'fixed_unknown');
    expect(resolved).toMatchObject({ status: 'resolved', resolutionKind: 'fixed_unknown', rootCause: null });
    expect(repo.getMessages(p.id).at(-1)?.kind).toBe('closed');
  });

  it('marks the last step as the fix when it was fixed', async () => {
    const { resolveProblem } = await import('@/lib/ai/engine');
    const repo = await import('@/lib/repo');
    const p = await make('Outlook will not open');
    await resolveProblem(p.id, 'New profile', 'fixed');
    expect(repo.getMessages(p.id).at(-1)?.kind).toBe('worked');
  });

  it('never shows a past match the AI did not judge relevant', async () => {
    const { similarFromMatches } = await import('@/lib/ai/engine');
    const a = await make('VPN drops every hour');
    const b = await make('VPN drops after sleep');
    const shown = similarFromMatches([
      { id: a.id, score: 0.9 },
      { id: b.id, score: 0.8, reason: 'Same VPN client dropping after idle' },
    ]);
    expect(shown.map((s) => s.id)).toEqual([b.id]);
    expect(shown[0].reason).toMatch(/VPN/);
    expect(similarFromMatches([{ id: a.id, score: 0 }], { requireReason: false })).toHaveLength(1);
  });

  it('clears the in-progress marker when a reply ends', async () => {
    const { liveTurn, streamTurn } = await import('@/lib/ai/engine');
    const p = await make('Laptop will not charge');
    const events = [];
    for await (const event of streamTurn(p.id, { provider: 'gemini' })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
    expect(liveTurn(p.id)).toBeNull();
  });
});
