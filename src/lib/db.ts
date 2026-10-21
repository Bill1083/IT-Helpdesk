import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { env } from '@/lib/env';
import { DEFAULT_ENVIRONMENT } from '@/lib/prompts';

/**
 * One SQLite file on the data volume. Migrations are numbered steps (SQL, or
 * a function for data moves) applied in order and tracked with PRAGMA user_version.
 */
const MIGRATIONS: (string | ((db: Database.Database) => void))[] = [
  `
  CREATE TABLE problems (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT NOT NULL,
    reporter TEXT,
    categories TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    summary TEXT,
    resolution TEXT,
    research_status TEXT NOT NULL DEFAULT 'idle',
    research_headline TEXT,
    research_brief TEXT,
    research_sources TEXT NOT NULL DEFAULT '[]',
    research_queries TEXT NOT NULL DEFAULT '[]',
    research_updated_at INTEGER,
    related TEXT NOT NULL DEFAULT '[]',
    embedding BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
  CREATE INDEX problems_updated ON problems(updated_at DESC);

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT NOT NULL DEFAULT '[]',
    provider TEXT,
    model TEXT,
    sources TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_problem ON messages(problem_id, id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE problems_fts USING fts5(
    problem_id UNINDEXED,
    body,
    tokenize = 'porter unicode61'
  );
  `,
  // 2: client environments, request modes, and the Useful commands library.
  `
  CREATE TABLE environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    profile TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  ALTER TABLE problems ADD COLUMN environment_id TEXT;
  ALTER TABLE problems ADD COLUMN mode TEXT NOT NULL DEFAULT 'fix';
  ALTER TABLE problems ADD COLUMN mode_locked INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX problems_environment ON problems(environment_id);

  CREATE TABLE commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    shell TEXT,
    title TEXT,
    description TEXT,
    when_to_use TEXT,
    danger INTEGER NOT NULL DEFAULT 1,
    danger_notes TEXT,
    needs_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );
  CREATE INDEX commands_platform ON commands(platform, last_used_at DESC);

  CREATE TABLE command_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id INTEGER NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
    problem_id TEXT REFERENCES problems(id) ON DELETE SET NULL,
    message_id INTEGER,
    context TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX command_uses_command ON command_uses(command_id);
  `,
  // 3: move the single environment setting into a first environment.
  (db) => {
    const now = Date.now();
    const old = db.prepare(`SELECT value FROM settings WHERE key = 'environment'`).get() as { value: string } | undefined;
    db.prepare(`INSERT INTO environments (id, name, profile, created_at, updated_at) VALUES ('default', 'Default', ?, ?, ?)`).run(
      old?.value ?? DEFAULT_ENVIRONMENT,
      now,
      now,
    );
    db.prepare(`UPDATE problems SET environment_id = 'default'`).run();
    db.prepare(`DELETE FROM settings WHERE key = 'environment'`).run();
  },
  // 4: how a chat was closed, the cause if found, and a short recap.
  `
  ALTER TABLE problems ADD COLUMN resolution_kind TEXT;
  ALTER TABLE problems ADD COLUMN root_cause TEXT;
  ALTER TABLE problems ADD COLUMN highlights TEXT NOT NULL DEFAULT '[]';
  `,
];

declare global {
  // Survives Next.js dev hot reloads so we keep a single connection.
  var __ithdDb: Database.Database | undefined;
}

function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const step = MIGRATIONS[version];
    db.transaction(() => {
      if (typeof step === 'string') db.exec(step);
      else step(db);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

export function uploadsDir(): string {
  return path.resolve(env.dataDir, 'uploads');
}

export function getDb(): Database.Database {
  if (globalThis.__ithdDb) return globalThis.__ithdDb;
  const dir = path.resolve(env.dataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(uploadsDir(), { recursive: true });

  const db = new Database(path.join(dir, 'helpdesk.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  // Research runs in-process; anything "running" at boot died with the old process.
  db.prepare(`UPDATE problems SET research_status = 'failed' WHERE research_status = 'running'`).run();

  globalThis.__ithdDb = db;
  return db;
}
