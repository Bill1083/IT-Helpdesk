'use client';

import { ArrowRight, ArrowUp, Building2, ChevronDown, History, Loader2, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AttachButton, AttachmentList, useAttachments } from '@/components/attachments';
import { Dropdown } from '@/components/dropdown';
import { ErrorNotice } from '@/components/error-notice';
import { MODE_ICONS } from '@/components/mode-icon';
import type { EnvironmentOption } from '@/components/sidebar';
import { useAutosize } from '@/components/use-autosize';
import { api, cn, notifyProblemsChanged, shortDate } from '@/lib/client';
import { MODES } from '@/lib/modes';
import type { Mode, Problem, ProblemListItem, SimilarProblem } from '@/lib/types';

const PLACEHOLDERS: Record<Mode | 'auto', string> = {
  auto: 'Describe the problem, or ask how to do something…',
  fix: "e.g. Sam's Slack desktop app keeps asking her to sign in since the macOS update. Web Slack works fine.",
  howto: 'e.g. How do I add a OneDrive folder as a shortcut in Windows Explorer?',
  plan: 'e.g. Plan moving 40 Macs from Jamf to Rippling MDM without disrupting staff',
  options: 'e.g. Password manager for a 30-person team: 1Password, Bitwarden or Keeper?',
};

const STARTERS: { mode: Mode; title: string; text: string }[] = [
  { mode: 'fix', title: 'Fix something broken', text: "Outlook keeps crashing on startup for one user since this morning's update." },
  { mode: 'howto', title: 'Ask how to do it', text: 'How do I add a OneDrive folder as a shortcut in Windows Explorer?' },
  { mode: 'plan', title: 'Plan a change', text: 'Plan onboarding a new starter: laptop, accounts and apps ready for day one.' },
  { mode: 'options', title: 'Weigh up options', text: 'Password manager for a 30-person team: 1Password vs Bitwarden vs Keeper?' },
];

const MODE_TINT: Record<Mode, string> = {
  fix: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  howto: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  plan: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  options: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function greeting(hour: number): string {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function NewProblem({
  reporters,
  aiReady,
  environments,
  defaultEnvironmentId,
  recentOpen,
}: {
  reporters: string[];
  aiReady: boolean;
  environments: EnvironmentOption[];
  defaultEnvironmentId: string | null;
  recentOpen: ProblemListItem[];
}) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [reporter, setReporter] = useState('');
  const [mode, setMode] = useState<Mode | 'auto'>('auto');
  const [environmentId, setEnvironmentId] = useState(defaultEnvironmentId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<SimilarProblem[]>([]);
  const [hello, setHello] = useState<string | null>(null);
  const files = useAttachments();
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Local time, so it is computed in the browser rather than on the server.
  useEffect(() => {
    setHello(greeting(new Date().getHours()));
    textarea.current?.focus();
  }, []);

  useAutosize(textarea, description, 320);

  // Live keyword matches against past problems while typing.
  useEffect(() => {
    const text = description.trim();
    if (text.length < 15) {
      setRelated([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ items: SimilarProblem[] }>('/api/problems/suggest', { method: 'POST', json: { text } });
        setRelated(data.items);
      } catch {
        setRelated([]);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [description]);

  async function submit() {
    if (submitting || files.uploading || description.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const { problem } = await api<{ problem: Problem }>('/api/problems', {
        method: 'POST',
        json: {
          description: description.trim(),
          reporter: reporter.trim() || undefined,
          attachments: files.attachments,
          environmentId: environmentId || null,
          mode,
        },
      });
      notifyProblemsChanged();
      router.push(`/p/${problem.id}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the problem.');
      setSubmitting(false);
    }
  }

  const canSend = !submitting && !files.uploading && description.trim().length >= 3;

  return (
    <div className="scroll-thin relative flex flex-1 flex-col overflow-y-auto">
      {/* A soft accent glow behind the composer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,rgb(var(--accent)/0.10),transparent)]"
      />
      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-16 pt-[12vh]">
        <p className={cn('mb-2 text-center text-sm font-medium text-accent transition-opacity duration-500', hello ? 'opacity-100' : 'opacity-0')}>
          {hello ?? 'Hello'}
        </p>
        <h1 className="mb-7 text-center text-3xl font-semibold tracking-tight text-zinc-900 sm:text-[2.1rem] dark:text-zinc-50">
          What can I help with?
        </h1>

        {!aiReady && (
          <div className="mb-4 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
            GEMINI_API_KEY isn&apos;t set on the server yet, so chats are saved but the AI can&apos;t answer.
          </div>
        )}

        <div className="mb-3 flex justify-center">
          <div className="inline-flex flex-wrap justify-center gap-0.5 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
            <ModeChip active={mode === 'auto'} onClick={() => setMode('auto')} icon={Sparkles} label="Auto" hint="Let the AI work out what kind of request it is" />
            {MODES.map((m) => (
              <ModeChip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)} icon={MODE_ICONS[m.key]} label={m.label} hint={m.hint} />
            ))}
          </div>
        </div>

        <div
          onDrop={files.onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-2xl bg-white shadow-soft ring-1 ring-zinc-200 transition focus-within:shadow-lift focus-within:ring-2 focus-within:ring-accent/40 dark:bg-zinc-900 dark:ring-zinc-800"
        >
          <textarea
            ref={textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onPaste={files.onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={3}
            placeholder={PLACEHOLDERS[mode]}
            className="block w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-zinc-400"
          />
          {(files.attachments.length > 0 || files.uploading) && (
            <div className="px-4 pt-2">
              <AttachmentList attachments={files.attachments} uploading={files.uploading} onRemove={files.remove} />
            </div>
          )}
          <div className="flex items-center gap-1 px-2 pb-2 pt-2">
            <AttachButton onFiles={(list) => void files.add(list)} />
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-500 transition focus-within:bg-zinc-100 hover:bg-zinc-100 dark:focus-within:bg-zinc-800 dark:hover:bg-zinc-800">
              <User className="size-4 shrink-0 text-zinc-400" />
              <input
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                list="reporters"
                placeholder="Who reported it?"
                className="min-w-0 flex-1 bg-transparent text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
              />
              <datalist id="reporters">
                {reporters.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            {environments.length > 0 && (
              <Dropdown
                label="Which client this is for"
                value={environmentId}
                onChange={setEnvironmentId}
                options={[...environments.map((e) => ({ value: e.id, label: e.name })), { value: '', label: 'No environment' }]}
                align="right"
                wrapperClassName="max-w-[42%] shrink-0"
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                renderTrigger={(selected) => (
                  <>
                    <Building2 className="size-4 shrink-0 text-zinc-400" />
                    <span className="min-w-0 truncate">{selected?.label ?? 'No environment'}</span>
                    <ChevronDown className="size-3.5 shrink-0 text-zinc-400" />
                  </>
                )}
              />
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              aria-label="Send"
              className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
        <p className="mt-2 hidden text-center text-xs text-zinc-400 sm:block">
          Enter to send · Shift+Enter for a new line · paste or drop screenshots
        </p>

        {(error || files.error) && (
          <div className="mt-4">
            <ErrorNotice error={error || files.error || ''} context={error ? 'general' : 'upload'} onRetry={error ? () => void submit() : undefined} />
          </div>
        )}

        {related.length > 0 ? (
          <section className="mt-8 animate-fade-up">
            <SectionTitle icon={<History className="size-3.5" />}>Possibly related</SectionTitle>
            <div className="space-y-2">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/p/${r.id}`}
                  className="block rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-zinc-200 transition hover:ring-zinc-300 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{r.title || r.description}</span>
                    <time suppressHydrationWarning className="shrink-0 text-xs text-zinc-400">
                      {shortDate(r.createdAt)}
                    </time>
                  </div>
                  {r.resolution && <p className="mt-1 line-clamp-2 text-zinc-500">Fixed by: {r.resolution}</p>}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          !description && (
            <>
              <section className="mt-9 grid gap-2.5 sm:grid-cols-2">
                {STARTERS.map((s) => {
                  const Icon = MODE_ICONS[s.mode];
                  return (
                    <button
                      key={s.mode}
                      type="button"
                      onClick={() => {
                        setMode(s.mode);
                        setDescription(s.text);
                        requestAnimationFrame(() => textarea.current?.focus());
                      }}
                      className="group flex gap-3 rounded-xl bg-white p-3.5 text-left ring-1 ring-zinc-200/80 transition hover:-translate-y-px hover:shadow-soft hover:ring-zinc-300 dark:bg-zinc-900/60 dark:ring-zinc-800 dark:hover:ring-zinc-700"
                    >
                      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', MODE_TINT[s.mode])}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-zinc-500">{s.text}</span>
                      </span>
                    </button>
                  );
                })}
              </section>

              {recentOpen.length > 0 && (
                <section className="mt-8">
                  <SectionTitle icon={<History className="size-3.5" />}>Pick up where you left off</SectionTitle>
                  <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl ring-1 ring-zinc-200/80 dark:divide-zinc-800 dark:ring-zinc-800">
                    {recentOpen.map((p) => {
                      const Icon = MODE_ICONS[p.mode];
                      return (
                        <Link
                          key={p.id}
                          href={`/p/${p.id}`}
                          className="group flex items-center gap-3 bg-white px-4 py-2.5 text-sm transition hover:bg-zinc-50 dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
                        >
                          <Icon className="size-4 shrink-0 text-zinc-400" />
                          <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{p.title || p.description}</span>
                          <time suppressHydrationWarning className="shrink-0 text-xs text-zinc-400">
                            {shortDate(p.updatedAt)}
                          </time>
                          <ArrowRight className="size-3.5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
      {icon} {children}
    </p>
  );
}

function ModeChip({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition',
        active
          ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
      )}
    >
      <Icon className={cn('size-3.5', active && 'text-accent')} /> {label}
    </button>
  );
}
