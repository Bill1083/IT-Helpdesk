import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

// A throwaway database; no API keys, so capture uses the pattern ratings only.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ithd-test-'));
process.env.DATA_DIR = dir;
delete process.env.GEMINI_API_KEY;

afterAll(() => {
  globalThis.__ithdDb?.close();
  globalThis.__ithdDb = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('environments and command capture', () => {
  it('starts with a Default environment from the migration', async () => {
    const repo = await import('@/lib/repo');
    expect(repo.listEnvironments(repo.OWNER_ID).map((e) => e.name)).toEqual(['Default']);
  });

  it('saves commands from a reply, once per command, with uses per chat', async () => {
    const repo = await import('@/lib/repo');
    const { captureCommands } = await import('@/lib/ai/capture');
    const acme = repo.createEnvironment(repo.OWNER_ID, 'Acme', '- Microsoft 365');

    const make = (description: string) =>
      repo.createProblem({
        accountId: repo.OWNER_ID,
        description,
        reporter: 'Tom',
        attachments: [],
        environmentId: acme.id,
        mode: 'fix',
        modeLocked: false,
        categories: ['windows'],
      }).problem;

    const reply = '### Step 1 - Flush DNS\n```powershell\nipconfig /flushdns\n```\n```cmd\nrd /s /q "%LOCALAPPDATA%\\Microsoft\\Teams"\n```';
    const first = make('Teams will not load for Tom');
    await captureCommands(first, repo.addMessage({ problemId: first.id, role: 'assistant', kind: 'step', content: reply }));
    const second = make('Teams blank screen again');
    await captureCommands(second, repo.addMessage({ problemId: second.id, role: 'assistant', kind: 'step', content: '```\nIPCONFIG /flushdns\n```' }));

    const commands = repo.listCommands(repo.OWNER_ID);
    expect(commands).toHaveLength(2);
    const flush = commands.find((c) => c.command.toLowerCase().includes('flushdns'))!;
    expect(flush.platform).toBe('windows');
    expect(flush.danger).toBe(1);
    expect(flush.uses).toHaveLength(2);
    expect(flush.uses[0].environmentName).toBe('Acme');
    const wipe = commands.find((c) => c.command.startsWith('rd /s'))!;
    expect(wipe.danger).toBe(4);
    expect(wipe.dangerNotes).toMatch(/deletes folders/i);
  });

  it('keeps chats when their environment is deleted', async () => {
    const repo = await import('@/lib/repo');
    const env = repo.createEnvironment(repo.OWNER_ID, 'Old client', '');
    const { problem } = repo.createProblem({
      accountId: repo.OWNER_ID,
      description: 'Printer offline',
      reporter: null,
      attachments: [],
      environmentId: env.id,
      mode: 'fix',
      modeLocked: false,
      categories: [],
    });
    repo.deleteEnvironment(env.id);
    expect(repo.getProblem(problem.id)?.environmentId).toBeNull();
  });
});
