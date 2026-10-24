import { describe, expect, it } from 'vitest';

import { createSessionToken, passwordMatches, verifySessionToken } from '@/lib/auth';
import { stepTitle } from '@/lib/client';
import { routePlaybooks } from '@/lib/playbooks';
import { reportText } from '@/lib/prompts';
import { ftsQuery } from '@/lib/repo';

const SECRET = 'test-secret';

describe('session tokens', () => {
  const ACCOUNT = { id: 'owner', version: 1 };

  it('round-trips a remembered session', async () => {
    const { token } = await createSessionToken(SECRET, true, 30, ACCOUNT, 1_000);
    const session = await verifySessionToken(SECRET, token, 2_000);
    expect(session).toMatchObject({ remember: true, issuedAt: 1_000, expiresAt: 1_000 + 30 * 86_400_000, accountId: 'owner', version: 1 });
  });

  it('gives a short session without remember me', async () => {
    const { session } = await createSessionToken(SECRET, false, 30, ACCOUNT, 0);
    expect(session.expiresAt).toBe(12 * 3_600_000);
  });

  it('rejects tampered, expired and foreign tokens', async () => {
    const { token } = await createSessionToken(SECRET, true, 30, ACCOUNT, 0);
    const [payload, signature] = token.split('.');
    expect(await verifySessionToken(SECRET, `${payload}x.${signature}`, 1)).toBeNull();
    expect(await verifySessionToken(SECRET, token, 31 * 86_400_000)).toBeNull();
    expect(await verifySessionToken('other-secret', token, 1)).toBeNull();
    expect(await verifySessionToken(SECRET, undefined)).toBeNull();
    expect(await verifySessionToken(SECRET, 'garbage')).toBeNull();
  });

  it('compares passwords', async () => {
    expect(await passwordMatches(SECRET, 'hunter2', 'hunter2')).toBe(true);
    expect(await passwordMatches(SECRET, 'hunter', 'hunter2')).toBe(false);
  });
});

describe('playbook routing', () => {
  it('picks the matching specialists', () => {
    expect(routePlaybooks("Sam's Slack desktop app keeps asking her to sign in on her MacBook")).toEqual(
      expect.arrayContaining(['slack', 'macos']),
    );
    expect(routePlaybooks('Claude connector for Google Drive says access blocked').sort()).toEqual(['ai', 'google']);
    expect(routePlaybooks('Laptop not showing as enrolled in Rippling')).toContain('rippling');
    expect(routePlaybooks('hello there')).toEqual([]);
  });
});

describe('text helpers', () => {
  it('builds a safe FTS query', () => {
    expect(ftsQuery('Outlook "crashes" on startup!')).toBe('"outlook" OR "crashes" OR "startup"');
    expect(ftsQuery('a an to')).toBeNull();
  });

  it('extracts step titles', () => {
    expect(stepTitle('**Likely cause:** x\n### Step 2 - Clear the **cache**\n1. go')).toBe('Step 2 - Clear the cache');
    expect(stepTitle('No heading here')).toBeNull();
  });

  it('labels reports', () => {
    expect(reportText('failed', 'Same error')).toBe("Result: didn't work.\nSame error");
    expect(reportText('note', '')).toBe('(no details given)');
  });
});
