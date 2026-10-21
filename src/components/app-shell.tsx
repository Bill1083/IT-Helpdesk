'use client';

import { Menu, PanelLeftOpen, Plus, Settings, Terminal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Logo } from '@/components/logo';
import { Sidebar, type EnvironmentOption } from '@/components/sidebar';
import { cn } from '@/lib/client';
import type { ProblemListItem } from '@/lib/types';

const COLLAPSED_KEY = 'ithd.sidebarCollapsed';

export function AppShell({
  initialProblems,
  environments,
  children,
}: {
  initialProblems: ProblemListItem[];
  environments: EnvironmentOption[];
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // storage unavailable: start expanded
    }
  }, []);

  const toggle = useCallback((next?: boolean) => {
    setCollapsed((current) => {
      const value = next ?? !current;
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
      } catch {
        // ignore
      }
      return value;
    });
  }, []);

  // Close the mobile drawer after navigating.
  useEffect(() => setDrawer(false), [pathname]);

  // Ctrl/Cmd+K jumps to search; Ctrl/Cmd+B shows or hides the sidebar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) toggle(false);
        else setDrawer(true);
        requestAnimationFrame(() => document.getElementById('sidebar-search')?.focus());
      } else if (key === 'b') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop: full sidebar, or a slim rail when collapsed */}
      {collapsed ? (
        <nav className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-zinc-200/80 bg-sidebar py-3 md:flex dark:border-zinc-800/80">
          <Logo size="sm" className="mb-2" />
          <RailButton label="Show sidebar (Ctrl+B)" onClick={() => toggle(false)}>
            <PanelLeftOpen className="size-[18px]" />
          </RailButton>
          <RailLink href="/" label="New chat">
            <Plus className="size-[18px]" />
          </RailLink>
          <RailLink href="/commands" label="Useful commands" active={pathname === '/commands'}>
            <Terminal className="size-[18px]" />
          </RailLink>
          <div className="flex-1" />
          <RailLink href="/settings" label="Settings" active={pathname === '/settings'}>
            <Settings className="size-[18px]" />
          </RailLink>
        </nav>
      ) : (
        <aside className="hidden w-[17rem] shrink-0 border-r border-zinc-200/80 bg-sidebar md:flex dark:border-zinc-800/80">
          <Sidebar initialProblems={initialProblems} environments={environments} onCollapse={() => toggle(true)} />
        </aside>
      )}

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] animate-fade-up bg-sidebar shadow-lift">
            <Sidebar initialProblems={initialProblems} environments={environments} />
          </aside>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <button
          aria-label="Open menu"
          onClick={() => setDrawer(true)}
          className="absolute left-3 top-3 z-30 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Menu className="size-5" />
        </button>
        {children}
      </main>
    </div>
  );
}

const railClass =
  'flex size-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={railClass}>
      {children}
    </button>
  );
}

function RailLink({ href, label, active, children }: { href: string; label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className={cn(railClass, active && 'bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100')}>
      {children}
    </Link>
  );
}
