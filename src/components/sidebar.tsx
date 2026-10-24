'use client';

import {
  Building2,
  ChevronDown,
  LayoutList,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Dropdown } from '@/components/dropdown';
import { Logo } from '@/components/logo';
import { MODE_ICONS } from '@/components/mode-icon';
import { OUTCOME_STYLE } from '@/components/outcome';
import { PROBLEMS_CHANGED, api, cn, shortDate } from '@/lib/client';
import { MODES } from '@/lib/modes';
import { outcomeOf } from '@/lib/outcomes';
import type { Mode, ProblemListItem } from '@/lib/types';

export interface EnvironmentOption {
  id: string;
  name: string;
}

const RESOLVED_SHOWN = 40;
const FILTER_KEY = 'ithd.environmentFilter';
const TYPE_KEY = 'ithd.typeFilter';

export function Sidebar({
  initialProblems,
  environments,
  account,
  onCollapse,
}: {
  initialProblems: ProblemListItem[];
  environments: EnvironmentOption[];
  account: { name: string; isOwner: boolean };
  /** Desktop only: hide the sidebar down to the slim rail. */
  onCollapse?: () => void;
}) {
  const [problems, setProblems] = useState(initialProblems);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<Mode | 'all'>('all');
  const pathname = usePathname();
  const router = useRouter();

  // The environment filter is a per-browser convenience.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setFilter(saved);
      const savedType = localStorage.getItem(TYPE_KEY) as Mode | 'all' | null;
      if (savedType && (savedType === 'all' || MODES.some((m) => m.key === savedType))) setTypeFilter(savedType);
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

  function changeType(value: Mode | 'all') {
    setTypeFilter(value);
    try {
      localStorage.setItem(TYPE_KEY, value);
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
    const visible = problems.filter(
      (p) =>
        (activeFilter === 'all' ? true : activeFilter === 'none' ? !p.environmentId : p.environmentId === activeFilter) &&
        (typeFilter === 'all' || p.mode === typeFilter),
    );
    return {
      open: visible.filter((p) => p.status === 'open'),
      resolved: visible.filter((p) => p.status === 'resolved').slice(0, RESOLVED_SHOWN),
    };
  }, [problems, activeFilter, typeFilter]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  const showEnvName = activeFilter === 'all' && environments.length > 1;

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo size="sm" />
        <span className="text-[15px] font-semibold tracking-tight">IT Desk</span>
        <span className="flex-1" />
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide sidebar (Ctrl+B)"
            title="Hide sidebar (Ctrl+B)"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      <div className="space-y-1 px-3 pb-3">
        <Link
          href="/"
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.99]"
        >
          <Plus className="size-4" strokeWidth={2.5} /> New chat
        </Link>
        <NavLink href="/commands" active={pathname === '/commands'} icon={<Terminal className="size-4" />}>
          Useful commands
        </NavLink>
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
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            renderTrigger={(selected) => (
              <>
                <Building2 className="size-4 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? 'All environments'}</span>
                <ChevronDown className="size-3.5 shrink-0 text-zinc-400" />
              </>
            )}
          />
        )}
        <TypeFilter value={typeFilter} onChange={changeType} />
        <div className="relative pt-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 mt-[3px] size-4 -translate-y-1/2 text-zinc-400" />
          <input
            id="sidebar-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search"
            className="w-full rounded-lg border border-transparent bg-zinc-200/50 py-2 pl-8 pr-14 text-sm outline-none transition placeholder:text-zinc-500 focus:border-zinc-300 focus:bg-white dark:bg-zinc-800/60 dark:focus:border-zinc-700 dark:focus:bg-zinc-900"
          />
          {query ? (
            <button
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 mt-[3px] hidden -translate-y-1/2 rounded-md border border-zinc-300 bg-white px-1.5 font-sans text-[10px] font-medium text-zinc-400 md:block dark:border-zinc-700 dark:bg-zinc-900">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {open.length + resolved.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">
            {query ? 'No matches.' : activeFilter === 'all' && typeFilter === 'all' ? 'Nothing yet. Start a new chat.' : 'Nothing matches these filters.'}
          </p>
        )}
        <Section title="Open" items={open} pathname={pathname} envNames={showEnvName ? envNames : null} />
        <Section title="Done" items={resolved} pathname={pathname} envNames={showEnvName ? envNames : null} />
      </nav>

      <div className="flex items-center gap-2.5 border-t border-zinc-200/80 px-4 pb-1 pt-3 dark:border-zinc-800/80">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent">
          {account.name.trim().charAt(0) || '?'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{account.name}</span>
        {account.isOwner && (
          <span className="shrink-0 rounded-full bg-zinc-200/80 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Owner
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <Link
          href="/settings"
          className={cn(
            'flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/70',
            pathname === '/settings' && 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
          )}
        >
          <Settings className="size-4" /> Settings
        </Link>
        <ThemeButton />
        <button
          aria-label="Sign out"
          title="Sign out"
          onClick={signOut}
          className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
        active
          ? 'bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
          : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/70',
      )}
    >
      <span className={active ? 'text-accent' : 'text-zinc-400'}>{icon}</span>
      {children}
    </Link>
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
    <div className="mb-4">
      <h3 className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {title}
        <span className="rounded-full bg-zinc-200/80 px-1.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {items.length}
        </span>
      </h3>
      <ul className="space-y-0.5">
        {items.map((p) => {
          const active = pathname === `/p/${p.id}`;
          const done = p.status === 'resolved';
          const outcome = done ? OUTCOME_STYLE[outcomeOf(p.resolutionKind, p.mode === 'fix')] : null;
          const Icon = outcome ? outcome.icon : MODE_ICONS[p.mode];
          const env = envNames && p.environmentId ? envNames.get(p.environmentId) : null;
          return (
            <li key={p.id}>
              <Link
                href={`/p/${p.id}`}
                className={cn(
                  'group flex gap-2.5 rounded-lg px-2.5 py-2 transition',
                  active
                    ? 'bg-white shadow-sm ring-1 ring-zinc-200/90 dark:bg-zinc-800/90 dark:ring-zinc-700/70'
                    : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50',
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    outcome ? outcome.text : active ? 'text-accent' : 'text-zinc-400 group-hover:text-zinc-500',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-[13.5px] leading-5', active ? 'font-medium text-zinc-900 dark:text-zinc-50' : 'text-zinc-700 dark:text-zinc-300')}>
                    {p.title || p.description}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-400">
                    {env && <span className="truncate">{env}</span>}
                    {env && <span>·</span>}
                    {p.reporter && <span className="truncate">{p.reporter}</span>}
                    {p.reporter && <span>·</span>}
                    <time suppressHydrationWarning className="shrink-0">
                      {shortDate(p.createdAt)}
                    </time>
                  </p>
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
      className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Icon className="size-4" />
    </button>
  );
}

/** All / Fix / How-to / Plan / Options. The active one shows its name. */
function TypeFilter({ value, onChange }: { value: Mode | 'all'; onChange: (value: Mode | 'all') => void }) {
  const options: { key: Mode | 'all'; label: string; icon: typeof LayoutList }[] = [
    { key: 'all', label: 'All', icon: LayoutList },
    ...MODES.map((m) => ({ key: m.key, label: m.label, icon: MODE_ICONS[m.key] })),
  ];
  return (
    <div role="group" aria-label="Filter by type" className="flex gap-0.5 rounded-lg bg-zinc-200/50 p-0.5 dark:bg-zinc-800/60">
      {options.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            title={label}
            onClick={() => onChange(key)}
            className={cn(
              'flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition',
              active
                ? 'flex-[2] bg-white px-2 text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                : 'flex-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
            )}
          >
            <Icon className={cn('size-3.5 shrink-0', active && key !== 'all' && 'text-accent')} />
            {active && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
