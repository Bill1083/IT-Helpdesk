'use client';

import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Logo } from '@/components/logo';
import { api, cn } from '@/lib/client';

const MIN_LENGTH = 10;

/** First sign-in with a temporary password: choose your own before anything else. */
export function SetPasswordForm({ name }: { name: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = password.length > 0 && password === confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!longEnough || !matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/account/password', { method: 'POST', json: { password } });
      router.replace('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your password.');
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  const fieldClass =
    'w-full rounded-xl bg-white py-3 pl-10 pr-11 outline-none ring-1 ring-zinc-200 transition focus:ring-2 focus:ring-accent/50 dark:bg-zinc-950 dark:ring-zinc-800';

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
          <h1 className="text-xl font-semibold tracking-tight">Create your password</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Hi {name}. You signed in with a temporary password. Choose your own before continuing.
          </p>
        </div>

        <div className="space-y-3">
          <label className="relative block">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type={show ? 'text' : 'password'}
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              className={fieldClass}
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

          <label className="relative block">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              aria-label="Confirm password"
              className={cn(fieldClass, confirm.length > 0 && !matches && 'ring-red-300 focus:ring-red-400/60 dark:ring-red-900')}
            />
          </label>

          <ul className="space-y-1 pl-1 text-xs">
            <li className={cn('flex items-center gap-1.5', longEnough ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')}>
              <Check className={cn('size-3.5', !longEnough && 'opacity-30')} /> At least {MIN_LENGTH} characters
            </li>
            <li className={cn('flex items-center gap-1.5', matches ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')}>
              <Check className={cn('size-3.5', !matches && 'opacity-30')} /> Passwords match
            </li>
          </ul>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !longEnough || !matches}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Save and continue
        </button>

        <button
          type="button"
          onClick={signOut}
          className="mt-3 w-full text-center text-sm text-zinc-500 transition hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Sign out instead
        </button>
      </form>
    </div>
  );
}