'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Sidebar, type EnvironmentOption } from '@/components/sidebar';
import type { ProblemListItem } from '@/lib/types';

export function AppShell({
  initialProblems,
  environments,
  children,
}: {
  initialProblems: ProblemListItem[];
  environments: EnvironmentOption[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer after navigating.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-zinc-200 bg-zinc-50 md:flex dark:border-zinc-800 dark:bg-zinc-900">
        <Sidebar initialProblems={initialProblems} environments={environments} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] bg-zinc-50 shadow-xl dark:bg-zinc-900">
            <Sidebar initialProblems={initialProblems} environments={environments} />
          </aside>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="absolute left-3 top-3 z-30 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Menu className="size-5" />
        </button>
        {children}
      </main>
    </div>
  );
}
