import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { generatePassword, hashPassword, verifyPassword } from '@/lib/passwords';

// A throwaway database; no API keys, so nothing calls an AI.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ithd-accounts-'));
process.env.DATA_DIR = dir;
delete process.env.GEMINI_API_KEY;

afterAll(() => {
  globalThis.__ithdDb?.close();
  globalThis.__ithdDb = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('passwords', () => {
  it('generates readable passwords without ambiguous characters', () => {
    const password = generatePassword();
    expect(password).toMatch(/^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
    // 0/o/1/l/i are easy to mix up when read aloud or typed from a message.
    expect(password).not.toMatch(/[01oli]/i);
  });

  it('hashes and verifies, and rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('account isolation', () => {
  it('starts with just the owner', async () => {
    const repo = await import('@/lib/repo');
    const accounts = repo.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: repo.OWNER_ID, isOwner: true });
  });

  it('keeps each account\'s chats, environments and commands apart', async () => {
    const repo = await import('@/lib/repo');
    const { captureCommands } = await import('@/lib/ai/capture');

    const guest = repo.createAccount('Guest', await hashPassword('irrelevant-for-this-test'));
    const ownerEnv = repo.createEnvironment(repo.OWNER_ID, 'Owner client', '');
    const guestEnv = repo.createEnvironment(guest.id, 'Guest client', '');

    const { problem: ownerProblem, message } = repo.createProblem({
      accountId: repo.OWNER_ID,
      description: 'Owner-only problem',
      reporter: null,
      attachments: [],
      environmentId: ownerEnv.id,
      mode: 'fix',
      modeLocked: false,
      categories: [],
    });
    const { problem: guestProblem } = repo.createProblem({
      accountId: guest.id,
      description: 'Guest-only problem',
      reporter: null,
      attachments: [],
      environmentId: guestEnv.id,
      mode: 'fix',
      modeLocked: false,
      categories: [],
    });

    // Chats: each account sees only its own.
    expect(repo.listProblems(repo.OWNER_ID).map((p) => p.id)).toContain(ownerProblem.id);
    expect(repo.listProblems(repo.OWNER_ID).map((p) => p.id)).not.toContain(guestProblem.id);
    expect(repo.listProblems(guest.id).map((p) => p.id)).toContain(guestProblem.id);
    expect(repo.listProblems(guest.id).map((p) => p.id)).not.toContain(ownerProblem.id);

    // Fetching by id is refused across accounts.
    expect(repo.getOwnedProblem(ownerProblem.id, guest.id)).toBeNull();
    expect(repo.getOwnedProblem(guestProblem.id, repo.OWNER_ID)).toBeNull();
    expect(repo.getOwnedProblem(ownerProblem.id, repo.OWNER_ID)?.id).toBe(ownerProblem.id);

    // Environments: each account sees only its own.
    expect(repo.listEnvironments(repo.OWNER_ID).map((e) => e.id)).toContain(ownerEnv.id);
    expect(repo.listEnvironments(repo.OWNER_ID).map((e) => e.id)).not.toContain(guestEnv.id);
    expect(repo.getOwnedEnvironment(guestEnv.id, repo.OWNER_ID)).toBeNull();

    // A command the guest's AI saved is invisible to the owner, and vice versa.
    const ownerMessage = repo.addMessage({ problemId: ownerProblem.id, role: 'assistant', kind: 'step', content: '```\nipconfig /flushdns\n```' });
    const guestMessage = repo.addMessage({ problemId: guestProblem.id, role: 'assistant', kind: 'step', content: '```\nipconfig /flushdns\n```' });
    await captureCommands(ownerProblem, ownerMessage);
    await captureCommands(guestProblem, guestMessage);
    expect(repo.listCommands(repo.OWNER_ID)).toHaveLength(1);
    expect(repo.listCommands(guest.id)).toHaveLength(1);
    expect(repo.listCommands(repo.OWNER_ID)[0].id).not.toBe(repo.listCommands(guest.id)[0].id);

    // Personal settings ("about") don't leak between accounts.
    repo.setAccountSetting(repo.OWNER_ID, 'about', 'Owner bio');
    repo.setAccountSetting(guest.id, 'about', 'Guest bio');
    expect(repo.getAccountSetting(repo.OWNER_ID, 'about')).toBe('Owner bio');
    expect(repo.getAccountSetting(guest.id, 'about')).toBe('Guest bio');

    void message; // the start message from createProblem, unused here
  });

  it('a password reset is temporary and bumps the session version', async () => {
    const repo = await import('@/lib/repo');
    const guest = repo.createAccount('Temp test', await hashPassword('first-password'));
    expect(guest.mustChangePassword).toBe(true);
    const firstVersion = guest.sessionVersion;

    const afterOwnChoice = repo.setAccountPassword(guest.id, await hashPassword('their-own-password'), { temporary: false });
    expect(afterOwnChoice).toMatchObject({ mustChangePassword: false });
    expect(afterOwnChoice!.sessionVersion).toBeGreaterThan(firstVersion);

    const afterReset = repo.setAccountPassword(guest.id, await hashPassword('reset-by-owner'), { temporary: true });
    expect(afterReset).toMatchObject({ mustChangePassword: true });
    expect(afterReset!.sessionVersion).toBeGreaterThan(afterOwnChoice!.sessionVersion);
  });

  it('deleting an account removes its data and never removes the owner', async () => {
    const repo = await import('@/lib/repo');
    const guest = repo.createAccount('To delete', await hashPassword('whatever-password'));
    const env = repo.createEnvironment(guest.id, 'Doomed client', '');
    const { problem } = repo.createProblem({
      accountId: guest.id,
      description: 'Will be deleted with the account',
      reporter: null,
      attachments: [],
      environmentId: env.id,
      mode: 'fix',
      modeLocked: false,
      categories: [],
    });

    repo.deleteAccount(guest.id);
    expect(repo.getAccount(guest.id)).toBeNull();
    expect(repo.getProblem(problem.id)).toBeNull();
    expect(repo.listEnvironments(guest.id)).toEqual([]);

    repo.deleteAccount(repo.OWNER_ID);
    expect(repo.getAccount(repo.OWNER_ID)).not.toBeNull();
  });
});
