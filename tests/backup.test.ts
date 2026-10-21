import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';

// A throwaway database with no R2 settings.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ithd-backup-'));
process.env.DATA_DIR = dir;
for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[key];

afterAll(() => {
  globalThis.__ithdDb?.close();
  globalThis.__ithdDb = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('backups', () => {
  it('is due with no backup, or one older than a day', async () => {
    const { shouldBackup } = await import('@/lib/backup');
    const now = Date.UTC(2026, 9, 21, 12);
    expect(shouldBackup(null, now)).toBe(true);
    expect(shouldBackup(now - 23 * 3_600_000, now)).toBe(false);
    expect(shouldBackup(now - 25 * 3_600_000, now)).toBe(true);
  });

  it('snapshots the live database into a valid gzipped SQLite file', async () => {
    const repo = await import('@/lib/repo');
    const { snapshot } = await import('@/lib/backup');
    repo.createEnvironment('Acme', '- Teams');

    const gz = await snapshot();
    const file = path.join(dir, 'restored.db');
    fs.writeFileSync(file, zlib.gunzipSync(gz));
    const restored = new Database(file, { readonly: true });
    const names = (restored.prepare('SELECT name FROM environments ORDER BY name').all() as { name: string }[]).map((r) => r.name);
    restored.close();

    expect(names).toEqual(['Acme', 'Default']);
    expect(fs.readdirSync(path.join(dir, 'backups'))).toEqual([]); // temp file cleaned up
  });

  it('reports not configured and records the error without R2 settings', async () => {
    const { backupStatus, runBackup } = await import('@/lib/backup');
    expect(backupStatus().configured).toBe(false);
    const status = await runBackup();
    expect(status.running).toBe(false);
    expect(status.lastError).toMatch(/not configured/);
    // A second call starts a fresh run rather than reusing a stuck one.
    expect((await runBackup()).running).toBe(false);
  });
});
