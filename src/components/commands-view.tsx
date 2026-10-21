'use client';

import { AlertTriangle, Apple, Check, ChevronDown, Copy, Monitor, Search, ShieldCheck, Terminal, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Dropdown } from '@/components/dropdown';
import { DANGER_LEVELS, dangerLabel } from '@/lib/commands';
import { api, cn, shortDate } from '@/lib/client';
import type { CommandPlatform, SavedCommand } from '@/lib/types';

const TABS: { key: CommandPlatform; label: string; icon: typeof Monitor }[] = [
  { key: 'windows', label: 'Windows', icon: Monitor },
  { key: 'mac', label: 'Mac', icon: Apple },
  { key: 'other', label: 'Other', icon: Terminal },
];

const DANGER_STYLES = [
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-300',
  'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
];

const TAB_KEY = 'ithd.commandsTab';
type Sort = 'recent' | 'used' | 'danger';

export function DangerBadge({ level }: { level: number }) {
  const n = Math.min(5, Math.max(1, level));
  return (
    <span
      title={DANGER_LEVELS[n - 1].hint}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', DANGER_STYLES[n - 1])}
    >
      {n >= 4 ? <AlertTriangle className="size-3" /> : <ShieldCheck className="size-3" />}
      {n} · {dangerLabel(n)}
    </span>
  );
}

export function CommandsView({ initial }: { initial: SavedCommand[] }) {
  const [commands, setCommands] = useState(initial);
  const [tab, setTab] = useState<CommandPlatform>('windows');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as CommandPlatform | null;
      if (saved && TABS.some((t) => t.key === saved)) setTab(saved);
    } catch {
      // storage unavailable
    }
  }, []);

  function changeTab(next: CommandPlatform) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // ignore
    }
  }

  const counts = useMemo(() => {
    const c: Record<CommandPlatform, number> = { windows: 0, mac: 0, other: 0 };
    for (const cmd of commands) c[cmd.platform] += 1;
    return c;
  }, [commands]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = commands.filter((c) => {
      if (c.platform !== tab) return false;
      if (!q) return true;
      return [c.command, c.title, c.description, c.whenToUse, c.dangerNotes, ...c.uses.map((u) => `${u.context} ${u.problemTitle} ${u.environmentName}`)]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return list.sort((a, b) =>
      sort === 'used' ? b.uses.length - a.uses.length || b.lastUsedAt - a.lastUsedAt : sort === 'danger' ? b.danger - a.danger || b.lastUsedAt - a.lastUsedAt : b.lastUsedAt - a.lastUsedAt,
    );
  }, [commands, tab, query, sort]);

  async function remove(id: number) {
    if (!window.confirm('Remove this command from your library?')) return;
    try {
      await api(`/api/commands/${id}`, { method: 'DELETE' });
      setCommands((list) => list.filter((c) => c.id !== id));
    } catch {
      // leave it
    }
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-10 pl-14 md:pl-4">
        <h1 className="text-2xl font-semibold tracking-tight">Useful commands</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every command the AI gives you is saved here with what it does, when to use it, where you used it, and how risky it is.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {TABS.filter((t) => t.key !== 'other' || counts.other > 0).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => changeTab(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                  tab === key ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
                )}
              >
                <Icon className="size-4" /> {label}
                <span className="text-xs text-zinc-400">{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands, uses, clients…"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-8 pr-8 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Dropdown
            label="Sort"
            value={sort}
            onChange={setSort}
            align="right"
            options={[
              { value: 'recent', label: 'Most recent' },
              { value: 'used', label: 'Most used' },
              { value: 'danger', label: 'Riskiest first' },
            ]}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            renderTrigger={(selected) => (
              <>
                {selected?.label}
                <ChevronDown className="size-4 text-zinc-400" />
              </>
            )}
          />
        </div>

        <details className="group mt-3 text-sm text-zinc-500">
          <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200">
            <ChevronDown className="size-4 transition group-open:rotate-180" /> What the danger ratings mean
          </summary>
          <ul className="mt-2 space-y-1.5 pl-5">
            {DANGER_LEVELS.map((d) => (
              <li key={d.level} className="flex items-center gap-2">
                <DangerBadge level={d.level} /> <span>{d.hint}</span>
              </li>
            ))}
          </ul>
        </details>

        <div className="mt-6 space-y-4">
          {visible.map((c) => (
            <CommandCard key={c.id} command={c} onDelete={() => void remove(c.id)} />
          ))}
          {visible.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
              {commands.length === 0
                ? 'No commands yet. When the AI suggests a command in a chat, it lands here automatically.'
                : query
                  ? 'No commands match that search.'
                  : `No ${TABS.find((t) => t.key === tab)?.label} commands yet.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommandCard({ command: c, onDelete }: { command: SavedCommand; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const [allUses, setAllUses] = useState(false);
  const uses = allUses ? c.uses : c.uses.slice(0, 2);

  return (
    <article className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 font-medium">{c.title || c.command.split('\n')[0]}</h2>
        <DangerBadge level={c.danger} />
        {c.needsAdmin && (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Admin
          </span>
        )}
        <button aria-label="Remove command" onClick={onDelete} className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="group relative mt-3">
        <pre className="scroll-thin overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 pr-10 font-mono text-[13px] leading-relaxed text-zinc-100 dark:bg-zinc-800">
          {c.command}
        </pre>
        <button
          aria-label="Copy command"
          onClick={async () => {
            await navigator.clipboard.writeText(c.command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-2 top-2 rounded-md bg-white/10 p-1.5 text-zinc-300 transition hover:bg-white/20"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        {c.description && (
          <div>
            <dt className="inline font-medium">What it does: </dt>
            <dd className="inline text-zinc-600 dark:text-zinc-400">{c.description}</dd>
          </div>
        )}
        {c.whenToUse && (
          <div>
            <dt className="inline font-medium">When to use: </dt>
            <dd className="inline text-zinc-600 dark:text-zinc-400">{c.whenToUse}</dd>
          </div>
        )}
        {c.dangerNotes && c.danger >= 2 && (
          <div className={cn(c.danger >= 4 ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-300')}>
            <dt className="inline font-medium">Dangers: </dt>
            <dd className="inline">{c.dangerNotes}</dd>
          </div>
        )}
      </dl>

      {c.uses.length > 0 && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Used {c.uses.length} time{c.uses.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {uses.map((u) => (
              <li key={u.id} className="text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{u.context}</span>
                <span className="text-zinc-400"> · </span>
                {u.problemId ? (
                  <Link href={`/p/${u.problemId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {u.problemTitle ?? 'Open chat'}
                  </Link>
                ) : (
                  <span className="text-zinc-500">chat deleted</span>
                )}
                {u.environmentName && <span className="text-zinc-500"> · {u.environmentName}</span>}
                <span className="text-zinc-500" suppressHydrationWarning>
                  {' '}
                  · {shortDate(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {c.uses.length > 2 && (
            <button onClick={() => setAllUses((v) => !v)} className="mt-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              {allUses ? 'Show fewer' : `Show all ${c.uses.length}`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
