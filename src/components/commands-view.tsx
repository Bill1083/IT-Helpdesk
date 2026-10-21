'use client';

import { AlertTriangle, Apple, ChevronDown, Clock, Info, Monitor, Search, ShieldAlert, Terminal, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Dropdown } from '@/components/dropdown';
import { CodeBlock } from '@/components/markdown';
import { DANGER_LEVELS, dangerLabel } from '@/lib/commands';
import { api, cn, shortDate } from '@/lib/client';
import type { CommandPlatform, SavedCommand } from '@/lib/types';

const TABS: { key: CommandPlatform; label: string; icon: typeof Monitor }[] = [
  { key: 'windows', label: 'Windows', icon: Monitor },
  { key: 'mac', label: 'Mac', icon: Apple },
  { key: 'other', label: 'Other', icon: Terminal },
];

/** Colour per danger level, 1 (safe) to 5 (critical). */
const LEVEL_FILL = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500'];
const LEVEL_TEXT = [
  'text-emerald-700 dark:text-emerald-400',
  'text-sky-700 dark:text-sky-400',
  'text-amber-700 dark:text-amber-400',
  'text-orange-700 dark:text-orange-400',
  'text-red-700 dark:text-red-400',
];

const TAB_KEY = 'ithd.commandsTab';
type Sort = 'recent' | 'used' | 'danger';

/** Five segments filled up to the level, so risk reads at a glance. */
export function DangerMeter({ level, showLabel = true }: { level: number; showLabel?: boolean }) {
  const n = Math.min(5, Math.max(1, Math.round(level)));
  return (
    <span title={`${n} of 5 · ${DANGER_LEVELS[n - 1].hint}`} className="inline-flex shrink-0 items-center gap-2">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn('h-2.5 w-1.5 rounded-sm', i <= n ? LEVEL_FILL[n - 1] : 'bg-zinc-200 dark:bg-zinc-800')} />
        ))}
      </span>
      {showLabel && <span className={cn('text-xs font-semibold', LEVEL_TEXT[n - 1])}>{dangerLabel(n)}</span>}
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
      sort === 'used'
        ? b.uses.length - a.uses.length || b.lastUsedAt - a.lastUsedAt
        : sort === 'danger'
          ? b.danger - a.danger || b.lastUsedAt - a.lastUsedAt
          : b.lastUsedAt - a.lastUsedAt,
    );
  }, [commands, tab, query, sort]);

  async function remove(id: number) {
    if (!window.confirm('Remove this command from your library?')) return;
    try {
      await api(`/api/commands/${id}`, { method: 'DELETE' });
      setCommands((list) => list.filter((c) => c.id !== id));
      toast('Command removed');
    } catch (e) {
      toast.error("Couldn't remove it", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-10 pl-14 md:px-6">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900">
            <Terminal className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Useful commands</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Every command the AI gives you, saved with what it does, when to use it, where you used it, and how risky it is.
            </p>
          </div>
        </div>

        <div className="sticky top-0 z-10 -mx-4 mt-7 flex flex-wrap items-center gap-2 bg-white/90 px-4 py-2 backdrop-blur-md md:-mx-6 md:px-6 dark:bg-zinc-950/90">
          <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {TABS.filter((t) => t.key !== 'other' || counts.other > 0).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => changeTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  tab === key
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
                )}
              >
                <Icon className="size-4" /> {label}
                <span className="rounded-full bg-zinc-200/80 px-1.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands, uses, clients…"
              className="w-full rounded-xl bg-white py-2 pl-9 pr-8 text-sm outline-none ring-1 ring-zinc-200 transition focus:ring-2 focus:ring-accent/40 dark:bg-zinc-900 dark:ring-zinc-800"
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
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
            className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-zinc-200 transition hover:ring-zinc-300 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-700"
            renderTrigger={(selected) => (
              <>
                {selected?.label}
                <ChevronDown className="size-4 text-zinc-400" />
              </>
            )}
          />
        </div>

        <details className="group mt-3 rounded-xl text-sm text-zinc-500">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 py-0.5 hover:text-zinc-800 dark:hover:text-zinc-200">
            <Info className="size-4" /> What the danger ratings mean
            <ChevronDown className="size-3.5 transition group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-2 rounded-xl bg-zinc-50 p-3.5 ring-1 ring-zinc-200/80 dark:bg-zinc-900/60 dark:ring-zinc-800">
            {DANGER_LEVELS.map((d) => (
              <li key={d.level} className="flex items-center gap-3">
                <span className="w-28 shrink-0">
                  <DangerMeter level={d.level} />
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">{d.hint}</span>
              </li>
            ))}
          </ul>
        </details>

        <div className="mt-5 space-y-4">
          {visible.map((c) => (
            <CommandCard key={c.id} command={c} onDelete={() => void remove(c.id)} />
          ))}
          {visible.length === 0 && (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
              <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
                <Terminal className="size-5" />
              </span>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                {commands.length === 0 ? 'No commands yet' : query ? 'No matches' : `No ${TABS.find((t) => t.key === tab)?.label} commands yet`}
              </p>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                {commands.length === 0
                  ? 'When the AI suggests a command in a chat, it lands here automatically with notes and a risk rating.'
                  : query
                    ? 'Try a different word, or search another tab.'
                    : 'They will appear here as the AI suggests them.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommandCard({ command: c, onDelete }: { command: SavedCommand; onDelete: () => void }) {
  const [allUses, setAllUses] = useState(false);
  const uses = allUses ? c.uses : c.uses.slice(0, 2);
  const risky = c.danger >= 4;

  return (
    <article className="group animate-fade-up rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/90 transition hover:shadow-soft sm:p-5 dark:bg-zinc-900/60 dark:ring-zinc-800">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{c.title || c.command.split('\n')[0]}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <DangerMeter level={c.danger} />
            {c.needsAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <ShieldAlert className="size-3" /> Needs admin
              </span>
            )}
          </div>
        </div>
        <button
          aria-label="Remove command"
          onClick={onDelete}
          className="shrink-0 rounded-lg p-1.5 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-950/40"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <CodeBlock code={c.command} lang={c.shell} showRisk={false} />

      <dl className="space-y-2 text-sm">
        {c.description && <Row label="What it does">{c.description}</Row>}
        {c.whenToUse && <Row label="When to use">{c.whenToUse}</Row>}
      </dl>
      {c.dangerNotes && c.danger >= 2 && (
        <div
          className={cn(
            'mt-3 flex gap-2.5 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset',
            risky ? 'bg-red-500/[0.07] ring-red-500/20' : 'bg-amber-500/[0.07] ring-amber-500/20',
          )}
        >
          <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', risky ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')} />
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Dangers: </span>
            {c.dangerNotes}
          </p>
        </div>
      )}

      {c.uses.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Clock className="size-3.5" /> Used {c.uses.length} time{c.uses.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-2 space-y-2">
            {uses.map((u) => (
              <li key={u.id} className="text-sm leading-relaxed">
                <span className="text-zinc-700 dark:text-zinc-300">{u.context}</span>
                <span className="text-zinc-300 dark:text-zinc-600"> · </span>
                {u.problemId ? (
                  <Link href={`/p/${u.problemId}`} className="font-medium text-accent hover:underline">
                    {u.problemTitle ?? 'Open chat'}
                  </Link>
                ) : (
                  <span className="text-zinc-400">chat deleted</span>
                )}
                {u.environmentName && (
                  <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-px text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {u.environmentName}
                  </span>
                )}
                <span className="ml-1.5 text-xs text-zinc-400" suppressHydrationWarning>
                  {shortDate(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {c.uses.length > 2 && (
            <button onClick={() => setAllUses((v) => !v)} className="mt-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              {allUses ? 'Show fewer' : `Show all ${c.uses.length}`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400 sm:pt-0.5">{label}</dt>
      <dd className="text-zinc-700 dark:text-zinc-300">{children}</dd>
    </div>
  );
}
