/**
 * Off-site backups to Cloudflare R2. The VPS stays the live copy; once a day
 * the database is snapshotted, gzipped and uploaded, new screenshots are
 * copied, and snapshots older than BACKUP_KEEP_DAYS are removed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getDb, uploadsDir } from '@/lib/db';
import { env } from '@/lib/env';
import { getSetting, setSetting } from '@/lib/repo';
import type { BackupStatus } from '@/lib/types';

const gzip = promisify(zlib.gzip);
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

export function backupConfigured(): boolean {
  return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket);
}

/** Due when there has been no successful backup in the last 24 hours. */
export function shouldBackup(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= DAY_MS;
}

function numberSetting(key: string): number | null {
  const value = Number(getSetting(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

let running: Promise<BackupStatus> | null = null;

export function backupStatus(): BackupStatus {
  return {
    configured: backupConfigured(),
    bucket: env.r2Bucket ?? null,
    running: Boolean(running),
    lastAt: numberSetting('backup_last_at'),
    lastSize: numberSetting('backup_last_size'),
    lastError: getSetting('backup_last_error') || null,
    lastErrorAt: numberSetting('backup_last_error_at'),
  };
}

/** A consistent copy of the live database (SQLite's online backup), gzipped. */
export async function snapshot(): Promise<Buffer> {
  const dir = path.resolve(env.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `snapshot-${Date.now()}.db`);
  try {
    await getDb().backup(file);
    return await gzip(fs.readFileSync(file));
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.r2AccessKeyId!, secretAccessKey: env.r2SecretAccessKey! },
    // Only send checksums S3 requires; the most compatible setting for R2.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

async function listObjects(s3: S3Client, bucket: string, prefix: string): Promise<{ key: string; modified: number }[]> {
  const objects: { key: string; modified: number }[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of page.Contents ?? []) {
      if (item.Key) objects.push({ key: item.Key, modified: item.LastModified?.getTime() ?? 0 });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function backupOnce(): Promise<void> {
  const s3 = client();
  const bucket = env.r2Bucket!;

  const body = await snapshot();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: `db/helpdesk-${stamp}.db.gz`, Body: body, ContentType: 'application/gzip' }),
  );

  // Screenshot and log names are random and never change, so only new ones are copied.
  const stored = new Set((await listObjects(s3, bucket, 'uploads/')).map((o) => o.key));
  for (const name of fs.existsSync(uploadsDir()) ? fs.readdirSync(uploadsDir()) : []) {
    const key = `uploads/${name}`;
    if (stored.has(key)) continue;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.readFileSync(path.join(uploadsDir(), name)) }));
  }

  const cutoff = Date.now() - env.backupKeepDays * DAY_MS;
  for (const old of (await listObjects(s3, bucket, 'db/')).filter((o) => o.modified < cutoff)) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: old.key }));
  }

  setSetting('backup_last_at', String(Date.now()));
  setSetting('backup_last_size', String(body.length));
  setSetting('backup_last_error', '');
}

/** Run a backup now; concurrent callers share the one in flight. Never throws. */
export function runBackup(): Promise<BackupStatus> {
  if (running) return running;
  const job = (async () => {
    try {
      if (!backupConfigured()) throw new Error('R2 is not configured. Add the R2_* values to .env.');
      await backupOnce();
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 400);
      console.error('[it-desk] backup failed:', message);
      setSetting('backup_last_error', message);
      setSetting('backup_last_error_at', String(Date.now()));
    }
  })().then(() => {
    // Cleared in a later tick, after `running` below has been set.
    running = null;
    return backupStatus();
  });
  running = job;
  return job;
}

declare global {
  // One scheduler per process, even across Next.js dev reloads.
  var __ithdBackupTimer: NodeJS.Timeout | undefined;
}

/**
 * Hourly check, back up if the last success is over a day old. Checking
 * rather than running at a fixed time survives restarts and needs no timezone.
 */
export function startBackupScheduler(): void {
  if (globalThis.__ithdBackupTimer || !backupConfigured()) return;
  const tick = () => {
    if (!running && shouldBackup(numberSetting('backup_last_at'), Date.now())) void runBackup();
  };
  // Give the server a minute to settle after boot before the first check.
  setTimeout(tick, 60_000).unref();
  globalThis.__ithdBackupTimer = setInterval(tick, CHECK_EVERY_MS);
  globalThis.__ithdBackupTimer.unref();
}
