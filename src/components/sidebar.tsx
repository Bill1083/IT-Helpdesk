'use client';

import { Building2, CheckCircle2, ChevronDown, LogOut, Monitor, Moon, Plus, Search, Settings, Sun, Terminal, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Dropdown } from '@/components/dropdown';
import { MODE_ICONS } from '@/components/mode-icon';
import { PROBLEMS_CHANGED, api, cn, shortDate } from '@/lib/client';
import type { ProblemListItem } from '@/lib/types';

export interface EnvironmentOption {
  id: string;
  name: string;
}

const RESOLVED_SHOWN = 40;
const FILTER_KEY = 'ithd.environmentFilter';

export function Sidebar({ initialProblems, environments }: { initialProblems: ProblemListItem[]; environments: EnvironmentOption[] }) {
  const [problems, setProblems] = useState(initialProblems);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const pathname = usePathname();
  const router = useRouter();

  // The environment filter is a per-browser convenience.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setFilter(saved);
    } catch {
      // storage unavailable: keep "all"
    }
  }, []);

  function changeFilter(value: string) {
    setFilter(value);
    try {
      localStorage.setItem(FILTER_KEY, value);
    } catch {
      // ignore
    }
  }

  const load = useCallback(async (q: string) => {
    try {
      const data = await api<{ problems: ProblemListItem[] }>(`/api/problems${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setProblems(data.problems);
    } catch {
      // keep the current list
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query.trim()), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  useEffect(() => {
    const refresh = () => void load(query.trim());
    window.addEventListener(PROBLEMS_CHANGED, refresh);
    return () => window.removeEventListener(PROBLEMS_CHANGED, refresh);
  }, [query, load]);

  const envNames = useMemo(() => new Map(environments.map((e) => [e.id, e.name])), [environments]);
  // A saved filter for an environment that has since been deleted falls back to all.
  const activeFilter = filter === 'all' || filter === 'none' || envNames.has(filter) ? filter : 'all';

  const { open, resolved } = useMemo(() => {
    const visible = problems.filter((p) =>
      activeFilter === 'all' ? true : activeFilter === 'none' ? !p.environmentId : p.environmentId === activeFilter,
    );
    return {
      open: visible.filter((p) => p.status === 'open'),
      resolved: visible.filter((p) => p.status === 'resolved').slice(0, RESOLVED_SHOWN),
    };
  }, [problems, activeFilter]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  const showEnvName = activeFilter === 'all' && environments.length > 1;

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
          <Wrench className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">IT Desk</span>
      </div>

      <div className="space-y-1 px-3 pb-3">
        <Link
          href="/"
          className="mb-1 flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          <Plus className="size-4" /> New chat
        </Link>
        <Link
          href="/commands"
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-zinc-200/60 dark:hover:bg-zinc-800',
            pathname === '/commands' && 'bg-zinc-200/80 dark:bg-zinc-800',
          )}
        >
          <Terminal className="size-4" /> Useful commands
        </Link>
        {environments.length > 0 && (
          <Dropdown
            label="Filter by environment"
            value={activeFilter}
            onChange={changeFilter}
            options={[
              { value: 'all', label: 'All environments' },
              ...environments.map((e) => ({ value: e.id, label: e.name })),
              { value: 'none', label: 'No environment' },
            ]}
            wrapperClassName="w-full"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
            renderTrigger={(selected) => (
              <>
                <Building2 className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? 'All environments'}</span>
                <ChevronDown className="size-4 shrink-0 text-zinc-400" />
              </>
            )}
          />
        )}
        <div className="relative pt-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 mt-0.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything, people…"
            className="w-full rounded-lg bg-zinc-200/60 py-2 pl-8 pr-8 text-sm outline-none placeholder:text-zinc-500 focus:bg-white focus:ring-1 focus:ring-zinc-300 dark:bg-zinc-800 dark:focus:bg-zinc-800 dark:focus:ring-zinc-600"
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {open.length + resolved.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">
            {query ? 'No matches.' : activeFilter === 'all' ? 'Nothing yet. Start a new chat.' : 'Nothing in this environment yet.'}
          </p>
        )}
        <Section title="Open" items={open} pathname={pathname} envNames={showEnvName ? envNames : null} />
        <Section title="Done" items={resolved} pathname={pathname} envNames={showEnvName ? envNames : null} />
      </nav>

      <div className="flex items-center gap-1 border-t border-zinc-200 px-2 py-2 dark:border-zinc-800">
        <Link
          href="/settings"
          className={cn(
            'flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-200/70 dark:hover:bg-zinc-800',
            pathname === '/settings' && 'bg-zinc-200/70 dark:bg-zinc-800',
          )}
        >
          <Settings className="size-4" /> Settings
        </Link>
        <ThemeButton />
        <button
          aria-label="Sign out"
          title="Sign out"
          onClick={signOut}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  pathname,
  envNames,
}: {
  title: string;
  items: ProblemListItem[];
  pathname: string;
  envNames: Map<string, string> | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="space-y-0.5">
        {items.map((p) => {
          const active = pathname === `/p/${p.id}`;
          const Icon = p.status === 'resolved' ? CheckCircle2 : MODE_ICONS[p.mode];
          const env = envNames && p.environmentId ? envNames.get(p.environmentId) : null;
          return (
            <li key={p.id}>
              <Link
                href={`/p/${p.id}`}
                className={cn(
                  'group block rounded-lg px-3 py-2 transition',
                  active ? 'bg-zinc-200/80 dark:bg-zinc-800' : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      'size-3.5 shrink-0',
                      p.status === 'resolved' ? 'text-emerald-600 dark:text-emerald-500' : 'text-zinc-400',
                    )}
                  />
                  <span className="truncate text-sm">{p.title || p.description}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 truncate pl-5 text-xs text-zinc-500">
                  {env && <span className="truncate">{env}</span>}
                  {env && <span>·</span>}
                  {p.reporter && <span className="truncate">{p.reporter}</span>}
                  {p.reporter && <span>·</span>}
                  <time suppressHydrationWarning className="shrink-0">
                    {shortDate(p.createdAt)}
                  </time>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const order = ['system', 'light', 'dark'] as const;
  const current = mounted ? ((theme as (typeof order)[number]) ?? 'system') : 'system';
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;
  return (
    <button
      aria-label={`Theme: ${current}`}
      title={`Theme: ${current}`}
      onClick={() => setTheme(order[(order.indexOf(current) + 1) % order.length])}
      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Icon className="size-4" />
    </button>
  );
}
