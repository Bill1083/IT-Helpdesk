import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { LIMITS, clip, outcomeOf, reference, sanitizeContent } from '@/lib/report/build';
import { renderReport, wrapCommand } from '@/lib/report/document';
import type { ReportContent, ReportMeta } from '@/lib/report/types';

// A throwaway database; no API keys, so nothing calls an AI.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ithd-report-'));
process.env.DATA_DIR = dir;
delete process.env.GEMINI_API_KEY;

afterAll(() => {
  globalThis.__ithdDb?.close();
  globalThis.__ithdDb = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('report content is forced into a fixed shape', () => {
  it('cleans markdown and clips at a word boundary', () => {
    expect(clip('**Reset** the `spooler`\n\nservice', 100)).toBe('Reset the spooler service');
    const long = clip('word '.repeat(100), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/wor…$/);
    expect(clip(undefined, 10)).toBe('');
  });

  it('accepts garbage and still returns every section', () => {
    const content = sanitizeContent('not an object', 'Fallback title');
    expect(content).toEqual({ title: 'Fallback title', objective: '', solution: '', technical: [], attempts: [], rootCause: null, followUp: [] });
  });

  it('enforces item limits, drops empty items and repairs bad results', () => {
    const many = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i));
    const content = sanitizeContent(
      {
        title: 'Printer offline.',
        objective: 'x'.repeat(2000),
        technical: [...many(10, (i) => ({ label: `Area ${i}:`, text: 'detail' })), { label: '', text: 'no label' }],
        attempts: many(20, (i) => ({ action: `Step ${i}`, result: i === 0 ? 'exploded' : 'failed' })),
        root_cause: '   ',
        follow_up: ['Do this', '', 'And this'],
      },
      'unused',
    );
    expect(content.title).toBe('Printer offline');
    expect(content.objective.length).toBeLessThanOrEqual(LIMITS.objective);
    expect(content.technical).toHaveLength(LIMITS.technicalItems);
    expect(content.technical[0].label).toBe('Area 0');
    expect(content.attempts).toHaveLength(LIMITS.attempts);
    expect(content.attempts[0].result).toBe('checked');
    expect(content.rootCause).toBeNull();
    expect(content.followUp).toEqual(['Do this', 'And this']);
  });
});

describe('report facts', () => {
  it('labels outcomes', () => {
    expect(outcomeOf({ status: 'open', resolutionKind: null }).label).toBe('In progress');
    expect(outcomeOf({ status: 'resolved', resolutionKind: 'workaround' })).toEqual({ label: 'Workaround in place', tone: 'warn' });
    expect(outcomeOf({ status: 'resolved', resolutionKind: 'unresolved' }).tone).toBe('bad');
  });

  it('builds a stable reference from the date opened, in the admin\'s time zone', () => {
    // 5 Nov 2026 14:30 UTC is already 6 Nov in Sydney.
    const at = Date.UTC(2026, 10, 5, 14, 30);
    expect(reference({ id: 'k3j9x2abcd', createdAt: at }, 'Australia/Sydney')).toBe('IT-261106-K3J9');
    expect(reference({ id: 'k3j9x2abcd', createdAt: at }, 'UTC')).toBe('IT-261105-K3J9');
  });

  it('reads client, reporter, steps and commands from the chat', async () => {
    const repo = await import('@/lib/repo');
    const { captureCommands } = await import('@/lib/ai/capture');
    const { buildMeta, recordedSteps } = await import('@/lib/report/build');
    const acme = repo.createEnvironment(repo.OWNER_ID, 'Acme Dental', '');
    const { problem } = repo.createProblem({
      accountId: repo.OWNER_ID,
      description: 'Printer offline',
      reporter: 'Jane',
      attachments: [],
      environmentId: acme.id,
      mode: 'fix',
      modeLocked: false,
      categories: [],
    });
    const first = repo.addMessage({ problemId: problem.id, role: 'assistant', kind: 'step', content: '### Step 1 - Restart the spooler\n```\nnet stop spooler\n```' });
    await captureCommands(problem, first);
    repo.addMessage({ problemId: problem.id, role: 'user', kind: 'failed', content: 'Still offline' });
    const second = repo.addMessage({ problemId: problem.id, role: 'assistant', kind: 'step', content: '### Step 2 - Reinstall the driver\n```\npnputil /enum-drivers\n```' });
    await captureCommands(problem, second);
    repo.addMessage({ problemId: problem.id, role: 'user', kind: 'worked', content: '' });

    const meta = buildMeta(repo.getProblem(problem.id)!, 'UTC');
    expect(meta).toMatchObject({ client: 'Acme Dental', reportedBy: 'Jane', type: 'Fix', outcome: 'In progress', preparedBy: 'Will Harvey Tech' });
    expect(meta.commands.map((c) => c.command)).toEqual(['net stop spooler', 'pnputil /enum-drivers']);
    expect(recordedSteps(repo.getMessages(problem.id))).toEqual([
      { action: 'Restart the spooler', result: 'failed' },
      { action: 'Reinstall the driver', result: 'worked' },
    ]);

    // The built-in "Default" environment is not shown as a client.
    repo.updateProblem(problem.id, { environmentId: 'default' });
    expect(buildMeta(repo.getProblem(problem.id)!, 'UTC').client).toBeNull();

    // Notes typed in the export dialog are kept for next time.
    repo.updateProblem(problem.id, { reportNotes: 'Also reinstalled the driver from the vendor site' }, false);
    expect(repo.getProblem(problem.id)?.reportNotes).toBe('Also reinstalled the driver from the vendor site');

    // The business name comes from the account's setting.
    repo.setAccountSetting(repo.OWNER_ID, 'report_name', 'Harvey IT');
    expect(buildMeta(repo.getProblem(problem.id)!, 'UTC').preparedBy).toBe('Harvey IT');
  });
});

describe('commands in the PDF', () => {
  it('breaks a path too long for the box without adding characters', () => {
    const longPath = 'C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\IntuneManagementExtension-20261105-093011-verbose-diagnostics.log';
    const wrapped = wrapCommand(longPath, 60);
    expect(wrapped.split('\n').every((line) => line.length <= 60)).toBe(true);
    expect(wrapped.replace(/\n/g, '')).toBe(longPath);
    // Prefers to break after a separator.
    expect(wrapped.split('\n')[0]).toMatch(/[\\-]$/);
  });

  it('leaves normal commands alone', () => {
    expect(wrapCommand('ipconfig /all')).toBe('ipconfig /all');
    expect(wrapCommand('netsh winsock reset\nipconfig /flushdns')).toBe('netsh winsock reset\nipconfig /flushdns');
  });
});

describe('rendering', () => {
  const meta: ReportMeta = {
    reference: 'IT-261105-ABCD',
    preparedBy: 'Will Harvey Tech',
    client: null,
    reportedBy: null,
    type: 'Fix',
    outcome: 'Fixed',
    outcomeTone: 'good',
    openedAt: Date.UTC(2026, 10, 5),
    closedAt: null,
    commands: [],
  };
  const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

  it('renders an almost empty report on one page', async () => {
    const content: ReportContent = { title: 'Printer offline', objective: '', solution: '', technical: [], attempts: [], rootCause: null, followUp: [] };
    const pdf = await renderReport({ content, meta, timeZone: 'UTC' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
  }, 30_000);

  it('renders a maximum-length report across pages', async () => {
    const text = (n: number) => 'word '.repeat(n).trim();
    const content = sanitizeContent(
      {
        title: text(30),
        objective: text(200),
        solution: text(300),
        technical: Array.from({ length: 6 }, () => ({ label: 'Network', text: text(100) })),
        attempts: Array.from({ length: 12 }, () => ({ action: text(50), result: 'failed' })),
        root_cause: text(120),
        follow_up: Array.from({ length: 5 }, () => text(50)),
      },
      'unused',
    );
    const pdf = await renderReport({ content, meta: { ...meta, commands: [{ command: 'x'.repeat(300), title: null }] }, timeZone: 'UTC' });
    expect(pages(pdf)).toBeGreaterThan(1);
  }, 30_000);
});
