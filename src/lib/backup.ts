/**
 * Off-site backups to Cloudflare R2. The VPS stays the live copy; once a day
 * the database is snapshotted, gzipped and uploaded, new screenshots are
 * copied, and snapshots older than BACKUP_KEEP_DAYS are removed.
 */

import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getDb, uploadsDir } from '@/lib/db';
import { env } from '@/lib/env';
import { explainError } from '@/lib/errors';
import { getSetting, setSetting } from '@/lib/repo';
import type { BackupStatus, ConnectionCheck } from '@/lib/types';

const gzip = promisify(zlib.gzip);
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

export function backupConfigured(): boolean {
  return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket);
}

/* ----------------------------------------------------------- configuration */

export interface R2Config {
  accountId: string;
  endpoint: string;
  host: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Reads the R2 settings, forgiving the usual paste mistakes: a full endpoint
 * URL in R2_ACCOUNT_ID, or the bucket's URL in R2_BUCKET. Returns the problems
 * it could not fix (which would otherwise surface as a TLS handshake failure).
 */
export function resolveR2(raw = {
  accountId: env.r2AccountId,
  bucket: env.r2Bucket,
  endpoint: env.r2Endpoint,
  accessKeyId: env.r2AccessKeyId,
  secretAccessKey: env.r2SecretAccessKey,
}): { config: R2Config | null; problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];

  const accountId = raw.accountId?.match(/[a-f0-9]{32}/i)?.[0]?.toLowerCase() ?? null;
  if (!raw.accountId) problems.push('R2_ACCOUNT_ID is missing.');
  else if (!accountId) problems.push('R2_ACCOUNT_ID should be the 32-character Account ID (digits and letters a–f) from the R2 overview page.');

  const bucket = raw.bucket?.split('/').filter(Boolean).pop()?.trim() ?? '';
  if (!raw.bucket) problems.push('R2_BUCKET is missing.');
  else if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    problems.push('R2_BUCKET should be just the bucket name, e.g. it-desk-backups (lowercase letters, digits and hyphens).');
  }

  let endpoint = accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
  if (raw.endpoint) {
    try {
      endpoint = new URL(raw.endpoint).origin;
    } catch {
      problems.push('R2_ENDPOINT should be a full URL like https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com.');
    }
  }

  // Both are 32-character codes, so this mix-up is easy to make and hard to spot.
  if (accountId && raw.accessKeyId && accountId === raw.accessKeyId.trim().toLowerCase()) {
    problems.push('R2_ACCOUNT_ID is the same as R2_ACCESS_KEY_ID. The Account ID is a different value, shown on the R2 overview page.');
  }
  if (!raw.accessKeyId) problems.push('R2_ACCESS_KEY_ID is missing.');
  else if (!/^[a-f0-9]{32}$/i.test(raw.accessKeyId)) {
    warnings.push('R2_ACCESS_KEY_ID usually has 32 characters. Make sure it is the "Access Key ID", not the token value.');
  }
  if (!raw.secretAccessKey) problems.push('R2_SECRET_ACCESS_KEY is missing.');
  else if (!/^[a-f0-9]{64}$/i.test(raw.secretAccessKey)) {
    warnings.push('R2_SECRET_ACCESS_KEY usually has 64 characters. Make sure it is the "Secret Access Key".');
  }

  if (problems.length || !accountId) return { config: null, problems, warnings };
  return {
    config: {
      accountId,
      endpoint,
      host: new URL(endpoint).hostname,
      bucket,
      accessKeyId: raw.accessKeyId!,
      secretAccessKey: raw.secretAccessKey!,
    },
    problems,
    warnings,
  };
}

function client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Keep the bucket in the path so every request goes to the documented
    // https://<ACCOUNT_ID>.r2.cloudflarestorage.com host.
    forcePathStyle: true,
    // Only send checksums S3 requires; the most compatible setting for R2.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/* ----------------------------------------------------------------- status */

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
    bucket: resolveR2().config?.bucket ?? env.r2Bucket ?? null,
    running: Boolean(running),
    lastAt: numberSetting('backup_last_at'),
    lastSize: numberSetting('backup_last_size'),
    lastError: getSetting('backup_last_error') || null,
    lastErrorAt: numberSetting('backup_last_error_at'),
  };
}

/* ----------------------------------------------------------------- backup */

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

async function backupOnce(config: R2Config): Promise<void> {
  const s3 = client(config);
  const { bucket } = config;

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
      const { config, problems } = resolveR2();
      if (!config) throw new Error(`R2 settings need fixing: ${problems.join(' ')}`);
      await backupOnce(config);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 600);
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

/* -------------------------------------------------------- connection test */

function failure(step: string, error: unknown): ConnectionCheck {
  const raw = (error instanceof Error ? error.message : String(error)).slice(0, 600);
  const help = explainError(raw, 'backup');
  return { step, ok: false, detail: help.title, hint: help.hint, raw };
}

function tlsHandshake(host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const protocol = socket.getProtocol() ?? 'TLS';
      socket.end();
      resolve(protocol);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`ETIMEDOUT connecting to ${host}:443`));
    });
    socket.on('error', reject);
  });
}

/**
 * Walks the backup path one stage at a time so a failure says exactly which
 * part is wrong: settings, DNS, TLS, sign-in, or write permission.
 */
export async function testConnection(): Promise<ConnectionCheck[]> {
  const checks: ConnectionCheck[] = [];
  const { config, problems, warnings } = resolveR2();
  if (!config) {
    checks.push({
      step: 'Settings',
      ok: false,
      detail: 'Some R2 settings need fixing',
      hint: problems.join(' '),
      raw: null,
    });
    return checks;
  }
  checks.push({
    step: 'Settings',
    ok: true,
    detail: `Bucket "${config.bucket}" at ${config.host}`,
    hint: warnings.length ? warnings.join(' ') : null,
    raw: null,
  });

  try {
    const { address } = await dns.lookup(config.host);
    checks.push({ step: 'Find the server', ok: true, detail: `${config.host} → ${address}`, hint: null, raw: null });
  } catch (error) {
    checks.push(failure('Find the server', error));
    return checks;
  }

  try {
    const protocol = await tlsHandshake(config.host);
    checks.push({ step: 'Secure connection', ok: true, detail: `Connected with ${protocol}`, hint: null, raw: null });
  } catch (error) {
    checks.push(failure('Secure connection', error));
    return checks;
  }

  const s3 = client(config);
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }));
    checks.push({ step: 'Sign in and read', ok: true, detail: 'Keys accepted and the bucket is readable', hint: null, raw: null });
  } catch (error) {
    checks.push(failure('Sign in and read', error));
    return checks;
  }

  const key = '.it-desk-connection-test';
  try {
    await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: `IT Desk connection test ${new Date().toISOString()}` }));
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    checks.push({ step: 'Write and delete', ok: true, detail: 'Backups can be written and old ones removed', hint: null, raw: null });
  } catch (error) {
    checks.push(failure('Write and delete', error));
  }
  return checks;
}

/* -------------------------------------------------------------- scheduler */

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
