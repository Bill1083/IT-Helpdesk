'use client';

import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { HintText } from '@/components/error-notice';
import { Logo } from '@/components/logo';
import { api, cn } from '@/lib/client';
import { explainError } from '@/lib/errors';

export function LoginForm({ next, rememberDays, configured }: { next: string; rememberDays: number; configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', json: { password, remember } });
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  // "Wrong password." and "Too many attempts…" are already plain; explain anything else.
  const known = error && /wrong password|too many attempts|APP_PASSWORD/i.test(error);
  const help = error && !known ? explainError(error) : null;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-50 px-4 dark:bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_50%_30%,rgb(var(--accent)/0.14),transparent)]"
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm animate-fade-up rounded-3xl bg-white p-8 shadow-lift ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size="lg" className="mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to IT Desk</p>
        </div>

        {!configured && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-500/20 dark:bg-amber-950/30 dark:text-amber-200">
            APP_PASSWORD isn&apos;t set in the server&apos;s .env yet.
          </p>
        )}

        <label className="relative block">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type={show ? 'text' : 'password'}
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className={cn(
              'w-full rounded-xl bg-white py-3 pl-10 pr-11 outline-none ring-1 transition focus:ring-2 dark:bg-zinc-950',
              error ? 'ring-red-300 focus:ring-red-400/60 dark:ring-red-900' : 'ring-zinc-200 focus:ring-accent/50 dark:ring-zinc-800',
            )}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </label>

        <label className="mt-4 flex cursor-pointer select-none items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-zinc-300 accent-accent"
          />
          Remember me for {rememberDays} days
        </label>

        {error && (
          <div className="mt-4 animate-pop-in text-sm text-red-600 dark:text-red-400">
            <p className="font-medium">{help ? help.title : error}</p>
            {help && (
              <p className="mt-0.5 text-red-600/80 dark:text-red-400/80">
                <HintText text={help.hint} />
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Sign in
        </button>
      </form>
    </div>
  );
}
