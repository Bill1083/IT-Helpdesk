'use client';

import { ArrowUp, Building2, History, Loader2, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AttachButton, AttachmentList, useAttachments } from '@/components/attachments';
import { MODE_ICONS } from '@/components/mode-icon';
import type { EnvironmentOption } from '@/components/sidebar';
import { api, cn, notifyProblemsChanged, shortDate } from '@/lib/client';
import { MODES } from '@/lib/modes';
import type { Mode, Problem, SimilarProblem } from '@/lib/types';

const PLACEHOLDERS: Record<Mode | 'auto', string> = {
  auto: "Something broken, a how-to, a plan or options to weigh up. e.g. Sam's Slack keeps asking her to sign in after the macOS update…",
  fix: "e.g. Sam's Slack desktop app keeps asking her to sign in after the macOS update, web Slack works fine…",
  howto: 'e.g. How do I add a OneDrive folder as a shortcut in Windows Explorer?',
  plan: 'e.g. Plan moving 40 Macs from Jamf to Rippling MDM without disrupting staff…',
  options: 'e.g. Password manager for a 30-person team: 1Password vs Bitwarden vs Keeper?',
};

export function NewProblem({
  reporters,
  aiReady,
  environments,
  defaultEnvironmentId,
}: {
  reporters: string[];
  aiReady: boolean;
  environments: EnvironmentOption[];
  defaultEnvironmentId: string | null;
}) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [reporter, setReporter] = useState('');
  const [mode, setMode] = useState<Mode | 'auto'>('auto');
  const [environmentId, setEnvironmentId] = useState(defaultEnvironmentId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<SimilarProblem[]>([]);
  const files = useAttachments();
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => textarea.current?.focus(), []);

  // Grow with the text, up to a cap.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    el.style.overflowY = el.scrollHeight > 320 ? 'auto' : 'hidden';
  }, [description]);

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

  return (
    <div className="scroll-thin flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
        <h1 className="mb-1 text-center text-2xl font-semibold tracking-tight sm:text-3xl">What do you need?</h1>
        <p className="mb-6 text-center text-sm text-zinc-500">
          Paste what they told you, errors and screenshots included, or ask how to do something.
        </p>

        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          <ModeChip active={mode === 'auto'} onClick={() => setMode('auto')} icon={Sparkles} label="Auto" hint="Let the AI work out what kind of request it is" />
          {MODES.map((m) => (
            <ModeChip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)} icon={MODE_ICONS[m.key]} label={m.label} hint={m.hint} />
          ))}
        </div>

        {!aiReady && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            GEMINI_API_KEY isn&apos;t set on the server yet, so chats are saved but the AI can&apos;t answer.
          </div>
        )}

        <div
          onDrop={files.onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-2xl border border-zinc-200 bg-white shadow-sm focus-within:border-zinc-300 focus-within:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-600"
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
          <div className="px-4 pt-2">
            <AttachmentList attachments={files.attachments} uploading={files.uploading} onRemove={files.remove} />
          </div>
          <div className="flex items-center gap-2 px-2 pb-2 pt-2">
            <AttachButton onFiles={(list) => void files.add(list)} />
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-500 focus-within:bg-zinc-100 dark:focus-within:bg-zinc-800">
              <User className="size-4 shrink-0" />
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
              <label
                title="Which client this is for"
                className="flex max-w-[40%] shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Building2 className="size-4 shrink-0" />
                <select
                  value={environmentId}
                  onChange={(e) => setEnvironmentId(e.target.value)}
                  aria-label="Environment"
                  className="min-w-0 cursor-pointer truncate bg-transparent text-zinc-800 outline-none dark:text-zinc-200"
                >
                  {environments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                  <option value="">No environment</option>
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || files.uploading || description.trim().length < 3}
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </div>

        {(error || files.error) && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error || files.error}</p>}

        {related.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <History className="size-3.5" /> Possibly related
            </p>
            <div className="space-y-2">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/p/${r.id}`}
                  className="block rounded-xl border border-zinc-200 px-4 py-3 text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{r.title || r.description}</span>
                    <time suppressHydrationWarning className="shrink-0 text-xs text-zinc-500">
                      {shortDate(r.createdAt)}
                    </time>
                  </div>
                  {r.resolution && <p className="mt-1 line-clamp-2 text-zinc-600 dark:text-zinc-400">Fixed by: {r.resolution}</p>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
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
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
