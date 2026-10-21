import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getDb, uploadsDir } from '@/lib/db';
import type {
  Attachment,
  CommandPlatform,
  CommandUse,
  Environment,
  EnvironmentSummary,
  Message,
  Mode,
  Problem,
  ProblemListItem,
  ProblemStatus,
  Provider,
  RelatedMatch,
  ResearchStatus,
  SavedCommand,
  Source,
} from '@/lib/types';

/* ---------------------------------------------------------------- helpers */

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function newId(): string {
  return crypto.randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toLowerCase();
}

type Row = Record<string, unknown>;

function toProblem(row: Row): Problem {
  return {
    id: row.id as string,
    title: (row.title as string | null) ?? null,
    description: row.description as string,
    reporter: (row.reporter as string | null) ?? null,
    environmentId: (row.environment_id as string | null) ?? null,
    mode: (row.mode as Mode) ?? 'fix',
    modeLocked: row.mode_locked === 1,
    categories: String(row.categories ?? '')
      .split(',')
      .filter(Boolean),
    status: row.status as ProblemStatus,
    summary: (row.summary as string | null) ?? null,
    resolution: (row.resolution as string | null) ?? null,
    researchStatus: row.research_status as ResearchStatus,
    researchHeadline: (row.research_headline as string | null) ?? null,
    researchBrief: (row.research_brief as string | null) ?? null,
    researchSources: parseJson<Source[]>(row.research_sources, []),
    researchQueries: parseJson<string[]>(row.research_queries, []),
    researchUpdatedAt: (row.research_updated_at as number | null) ?? null,
    related: parseJson<RelatedMatch[]>(row.related, []),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    resolvedAt: (row.resolved_at as number | null) ?? null,
  };
}

function toMessage(row: Row): Message {
  return {
    id: row.id as number,
    problemId: row.problem_id as string,
    role: row.role as Message['role'],
    kind: row.kind as string,
    content: row.content as string,
    attachments: parseJson<Attachment[]>(row.attachments, []),
    provider: (row.provider as Provider | null) ?? null,
    model: (row.model as string | null) ?? null,
    sources: parseJson<Source[]>(row.sources, []),
    createdAt: row.created_at as number,
  };
}

const PROBLEM_COLUMNS = `id, title, description, reporter, environment_id, mode, mode_locked, categories, status, summary, resolution,
  research_status, research_headline, research_brief, research_sources, research_queries,
  research_updated_at, related, created_at, updated_at, resolved_at`;

/** Keep the keyword index in step with the searchable fields. */
function refreshFts(id: string): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT title, description, reporter, summary, resolution FROM problems WHERE id = ?`)
    .get(id) as Row | undefined;
  db.prepare(`DELETE FROM problems_fts WHERE problem_id = ?`).run(id);
  if (!row) return;
  const body = [row.title, row.summary, row.description, row.resolution, row.reporter].filter(Boolean).join('\n');
  db.prepare(`INSERT INTO problems_fts (problem_id, body) VALUES (?, ?)`).run(id, body);
}

/* --------------------------------------------------------------- problems */

export function createProblem(input: {
  description: string;
  reporter: string | null;
  attachments: Attachment[];
  environmentId: string | null;
  mode: Mode;
  modeLocked: boolean;
  categories: string[];
}): {
  problem: Problem;
  message: Message;
} {
  const db = getDb();
  const id = newId();
  const now = Date.now();
  const messageId = db.transaction(() => {
    db.prepare(
      `INSERT INTO problems (id, description, reporter, environment_id, mode, mode_locked, categories, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.description,
      input.reporter,
      input.environmentId,
      input.mode,
      input.modeLocked ? 1 : 0,
      input.categories.join(','),
      now,
      now,
    );
    return db
      .prepare(
        `INSERT INTO messages (problem_id, role, kind, content, attachments, created_at) VALUES (?, 'user', 'start', ?, ?, ?)`,
      )
      .run(id, input.description, JSON.stringify(input.attachments), now).lastInsertRowid as number;
  })();
  refreshFts(id);
  return { problem: getProblem(id)!, message: getMessage(messageId)! };
}

export function getProblem(id: string): Problem | null {
  const row = getDb().prepare(`SELECT ${PROBLEM_COLUMNS} FROM problems WHERE id = ?`).get(id) as Row | undefined;
  return row ? toProblem(row) : null;
}

export function getProblems(ids: string[]): Problem[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .prepare(`SELECT ${PROBLEM_COLUMNS} FROM problems WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as Row[];
  return rows.map(toProblem);
}

/** Turn free text into an FTS5 OR-query of quoted terms. */
export function ftsQuery(text: string): string | null {
  const terms = Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  ).slice(0, 24);
  return terms.length ? terms.map((t) => `"${t}"`).join(' OR ') : null;
}

const STOPWORDS = new Set(
  'the and for with that this from have has was were are not but can cant get got how what when why who you your our they them their its into out about after before just been being any all also there then than she him her his said says user users issue problem please help need trying still'.split(
    ' ',
  ),
);

export function listProblems(opts: { q?: string; limit?: number } = {}): ProblemListItem[] {
  const db = getDb();
  const limit = opts.limit ?? 200;
  const query = opts.q ? ftsQuery(opts.q) : null;
  const columns = `p.id, p.title, p.description, p.reporter, p.environment_id, p.mode, p.status, p.created_at, p.updated_at`;
  const rows = query
    ? (db
        .prepare(
          `SELECT ${columns} FROM problems_fts f JOIN problems p ON p.id = f.problem_id
           WHERE problems_fts MATCH ? ORDER BY bm25(problems_fts) LIMIT ?`,
        )
        .all(query, limit) as Row[])
    : (db.prepare(`SELECT ${columns} FROM problems p ORDER BY p.updated_at DESC LIMIT ?`).all(limit) as Row[]);
  return rows.map((row) => ({
    id: row.id as string,
    title: (row.title as string | null) ?? null,
    description: row.description as string,
    reporter: (row.reporter as string | null) ?? null,
    environmentId: (row.environment_id as string | null) ?? null,
    mode: (row.mode as Mode) ?? 'fix',
    status: row.status as ProblemStatus,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }));
}

/** Keyword matches ranked by BM25, for live suggestions and the no-embedding fallback. */
export function keywordMatches(text: string, limit: number, excludeId?: string): { id: string; rank: number }[] {
  const query = ftsQuery(text);
  if (!query) return [];
  const rows = getDb()
    .prepare(
      `SELECT problem_id AS id, bm25(problems_fts) AS rank FROM problems_fts
       WHERE problems_fts MATCH ? AND problem_id != ? ORDER BY rank LIMIT ?`,
    )
    .all(query, excludeId ?? '', limit) as { id: string; rank: number }[];
  return rows;
}

export interface ProblemPatch {
  title?: string | null;
  reporter?: string | null;
  environmentId?: string | null;
  mode?: Mode;
  modeLocked?: boolean;
  categories?: string[];
  status?: ProblemStatus;
  summary?: string | null;
  resolution?: string | null;
  researchStatus?: ResearchStatus;
  researchHeadline?: string | null;
  researchBrief?: string | null;
  researchSources?: Source[];
  researchQueries?: string[];
  researchUpdatedAt?: number | null;
  related?: RelatedMatch[];
  resolvedAt?: number | null;
}

const PATCH_COLUMNS: Record<keyof ProblemPatch, [string, (v: never) => unknown]> = {
  title: ['title', (v) => v],
  reporter: ['reporter', (v) => v],
  environmentId: ['environment_id', (v) => v],
  mode: ['mode', (v) => v],
  modeLocked: ['mode_locked', (v: boolean) => (v ? 1 : 0)],
  categories: ['categories', (v: string[]) => v.join(',')],
  status: ['status', (v) => v],
  summary: ['summary', (v) => v],
  resolution: ['resolution', (v) => v],
  researchStatus: ['research_status', (v) => v],
  researchHeadline: ['research_headline', (v) => v],
  researchBrief: ['research_brief', (v) => v],
  researchSources: ['research_sources', (v: Source[]) => JSON.stringify(v)],
  researchQueries: ['research_queries', (v: string[]) => JSON.stringify(v)],
  researchUpdatedAt: ['research_updated_at', (v) => v],
  related: ['related', (v: RelatedMatch[]) => JSON.stringify(v)],
  resolvedAt: ['resolved_at', (v) => v],
};

/** Partial update. `touch` bumps updated_at so the problem rises in the sidebar. */
export function updateProblem(id: string, patch: ProblemPatch, touch = true): Problem | null {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof ProblemPatch, unknown][]) {
    if (value === undefined) continue;
    const [column, encode] = PATCH_COLUMNS[key];
    sets.push(`${column} = ?`);
    values.push(encode(value as never));
  }
  if (touch) {
    sets.push('updated_at = ?');
    values.push(Date.now());
  }
  if (sets.length > 0) {
    getDb()
      .prepare(`UPDATE problems SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values, id);
  }
  if (['title', 'reporter', 'summary', 'resolution'].some((k) => k in patch)) refreshFts(id);
  return getProblem(id);
}

export function deleteProblem(id: string): void {
  const db = getDb();
  for (const message of getMessages(id)) {
    for (const attachment of message.attachments) removeUpload(attachment.name);
  }
  db.prepare(`DELETE FROM problems WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM problems_fts WHERE problem_id = ?`).run(id);
}

export function reporters(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT reporter FROM problems WHERE reporter IS NOT NULL AND reporter != ''
       GROUP BY reporter ORDER BY MAX(updated_at) DESC LIMIT 200`,
    )
    .all() as { reporter: string }[];
  return rows.map((r) => r.reporter);
}

/* ------------------------------------------------------------- embeddings */

export function setEmbedding(id: string, vector: Float32Array): void {
  getDb()
    .prepare(`UPDATE problems SET embedding = ? WHERE id = ?`)
    .run(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength), id);
}

export function allEmbeddings(excludeId: string): { id: string; vector: Float32Array }[] {
  const rows = getDb()
    .prepare(`SELECT id, embedding FROM problems WHERE embedding IS NOT NULL AND id != ?`)
    .all(excludeId) as { id: string; embedding: Buffer }[];
  return rows.map((row) => ({
    id: row.id,
    vector: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
  }));
}

/* --------------------------------------------------------------- messages */

export function getMessages(problemId: string): Message[] {
  const rows = getDb()
    .prepare(`SELECT * FROM messages WHERE problem_id = ? ORDER BY id`)
    .all(problemId) as Row[];
  return rows.map(toMessage);
}

export function getMessage(id: number): Message | null {
  const row = getDb().prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Row | undefined;
  return row ? toMessage(row) : null;
}

export function addMessage(input: {
  problemId: string;
  role: Message['role'];
  kind: string;
  content: string;
  attachments?: Attachment[];
  provider?: Provider | null;
  model?: string | null;
  sources?: Source[];
}): Message {
  const db = getDb();
  const now = Date.now();
  const id = db
    .prepare(
      `INSERT INTO messages (problem_id, role, kind, content, attachments, provider, model, sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.problemId,
      input.role,
      input.kind,
      input.content,
      JSON.stringify(input.attachments ?? []),
      input.provider ?? null,
      input.model ?? null,
      JSON.stringify(input.sources ?? []),
      now,
    ).lastInsertRowid as number;
  db.prepare(`UPDATE problems SET updated_at = ? WHERE id = ?`).run(now, input.problemId);
  return getMessage(id)!;
}

export function deleteMessage(id: number): void {
  getDb().prepare(`DELETE FROM messages WHERE id = ?`).run(id);
}

/* --------------------------------------------------------------- settings */

export function getSetting(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value);
}

/* ----------------------------------------------------------- environments */

function toEnvironment(row: Row): Environment {
  return {
    id: row.id as string,
    name: row.name as string,
    profile: row.profile as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function listEnvironments(): EnvironmentSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM problems p WHERE p.environment_id = e.id) AS problem_count
       FROM environments e ORDER BY e.name COLLATE NOCASE`,
    )
    .all() as Row[];
  return rows.map((row) => ({ ...toEnvironment(row), problemCount: row.problem_count as number }));
}

export function getEnvironment(id: string | null): Environment | null {
  if (!id) return null;
  const row = getDb().prepare(`SELECT * FROM environments WHERE id = ?`).get(id) as Row | undefined;
  return row ? toEnvironment(row) : null;
}

export function createEnvironment(name: string, profile: string): Environment {
  const id = newId();
  const now = Date.now();
  getDb()
    .prepare(`INSERT INTO environments (id, name, profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, name, profile, now, now);
  return getEnvironment(id)!;
}

export function updateEnvironment(id: string, patch: { name?: string; profile?: string }): Environment | null {
  const current = getEnvironment(id);
  if (!current) return null;
  getDb()
    .prepare(`UPDATE environments SET name = ?, profile = ?, updated_at = ? WHERE id = ?`)
    .run(patch.name ?? current.name, patch.profile ?? current.profile, Date.now(), id);
  return getEnvironment(id);
}

/** Problems keep their history and become unassigned. */
export function deleteEnvironment(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE problems SET environment_id = NULL WHERE environment_id = ?`).run(id);
    db.prepare(`DELETE FROM environments WHERE id = ?`).run(id);
  })();
}

/* --------------------------------------------------------------- commands */

export function getCommandIdByFingerprint(fp: string): number | null {
  const row = getDb().prepare(`SELECT id FROM commands WHERE fingerprint = ?`).get(fp) as { id: number } | undefined;
  return row?.id ?? null;
}

export interface CommandFields {
  platform: CommandPlatform;
  shell: string | null;
  title: string | null;
  description: string | null;
  whenToUse: string | null;
  danger: number;
  dangerNotes: string | null;
  needsAdmin: boolean;
}

export function insertCommand(command: string, fp: string, fields: CommandFields): number {
  const now = Date.now();
  return getDb()
    .prepare(
      `INSERT INTO commands (command, fingerprint, platform, shell, title, description, when_to_use, danger, danger_notes, needs_admin, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      command,
      fp,
      fields.platform,
      fields.shell,
      fields.title,
      fields.description,
      fields.whenToUse,
      fields.danger,
      fields.dangerNotes,
      fields.needsAdmin ? 1 : 0,
      now,
      now,
    ).lastInsertRowid as number;
}

export function updateCommand(id: number, fields: CommandFields): void {
  getDb()
    .prepare(
      `UPDATE commands SET platform = ?, shell = ?, title = ?, description = ?, when_to_use = ?, danger = ?, danger_notes = ?, needs_admin = ? WHERE id = ?`,
    )
    .run(
      fields.platform,
      fields.shell,
      fields.title,
      fields.description,
      fields.whenToUse,
      fields.danger,
      fields.dangerNotes,
      fields.needsAdmin ? 1 : 0,
      id,
    );
}

export function addCommandUse(commandId: number, problemId: string, messageId: number, context: string | null): void {
  const db = getDb();
  const now = Date.now();
  // One use per step: re-capturing the same message only refreshes the note.
  const existing = db
    .prepare(`SELECT id FROM command_uses WHERE command_id = ? AND message_id = ?`)
    .get(commandId, messageId) as { id: number } | undefined;
  if (existing) db.prepare(`UPDATE command_uses SET context = COALESCE(?, context) WHERE id = ?`).run(context, existing.id);
  else {
    db.prepare(`INSERT INTO command_uses (command_id, problem_id, message_id, context, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      commandId,
      problemId,
      messageId,
      context,
      now,
    );
  }
  db.prepare(`UPDATE commands SET last_used_at = ? WHERE id = ?`).run(now, commandId);
}

export function listCommands(): SavedCommand[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM commands ORDER BY last_used_at DESC`).all() as Row[];
  const uses = db
    .prepare(
      `SELECT u.id, u.command_id, u.problem_id, u.context, u.created_at, p.title AS problem_title, p.description AS problem_description, e.name AS environment_name
       FROM command_uses u
       LEFT JOIN problems p ON p.id = u.problem_id
       LEFT JOIN environments e ON e.id = p.environment_id
       ORDER BY u.created_at DESC`,
    )
    .all() as Row[];
  const byCommand = new Map<number, CommandUse[]>();
  for (const u of uses) {
    const list = byCommand.get(u.command_id as number) ?? [];
    list.push({
      id: u.id as number,
      problemId: (u.problem_id as string | null) ?? null,
      problemTitle: (u.problem_title as string | null) ?? ((u.problem_description as string | null)?.slice(0, 80) || null),
      environmentName: (u.environment_name as string | null) ?? null,
      context: (u.context as string | null) ?? null,
      createdAt: u.created_at as number,
    });
    byCommand.set(u.command_id as number, list);
  }
  return rows.map((row) => ({
    id: row.id as number,
    command: row.command as string,
    platform: row.platform as CommandPlatform,
    shell: (row.shell as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    whenToUse: (row.when_to_use as string | null) ?? null,
    danger: row.danger as number,
    dangerNotes: (row.danger_notes as string | null) ?? null,
    needsAdmin: row.needs_admin === 1,
    createdAt: row.created_at as number,
    lastUsedAt: row.last_used_at as number,
    uses: byCommand.get(row.id as number) ?? [],
  }));
}

export function deleteCommand(id: number): boolean {
  return getDb().prepare(`DELETE FROM commands WHERE id = ?`).run(id).changes > 0;
}

/* ---------------------------------------------------------------- uploads */

const UPLOAD_NAME = /^[a-z0-9]{16,40}\.[a-z0-9]{2,5}$/;

export function uploadPath(name: string): string | null {
  return UPLOAD_NAME.test(name) ? path.join(uploadsDir(), name) : null;
}

export function removeUpload(name: string): void {
  const file = uploadPath(name);
  if (file) fs.rmSync(file, { force: true });
}
