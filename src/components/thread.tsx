'use client';

import { Building2, CheckCircle2, History, Loader2, MoreHorizontal, Pencil, RotateCcw, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MODE_ICONS } from '@/components/mode-icon';
import { ResearchBar, ResearchDrawer } from '@/components/research';
import { ReplyComposer, type ComposerSubmit, type ReplyComposerHandle } from '@/components/reply-composer';
import type { EnvironmentOption } from '@/components/sidebar';
import { StepBlock, StreamingStep, UserBubble } from '@/components/step';
import { api, cn, longDate, notifyProblemsChanged, readNdjson, shortDate } from '@/lib/client';
import { MODES } from '@/lib/modes';
import type { Message, Problem, Provider, ResearchSnapshot, SimilarProblem, StreamEvent } from '@/lib/types';
import type { ProblemView } from '@/lib/views';

interface TurnRequest {
  kind?: ComposerSubmit['kind'];
  content?: string;
  attachments?: ComposerSubmit['attachments'];
  regenerate?: boolean;
  provider?: Provider;
  search?: boolean;
}

function toResearch(problem: Problem): ResearchSnapshot {
  return {
    status: problem.researchStatus,
    headline: problem.researchHeadline,
    brief: problem.researchBrief,
    sources: problem.researchSources,
    queries: problem.researchQueries,
    updatedAt: problem.researchUpdatedAt,
    title: problem.title,
    categories: problem.categories,
    summary: problem.summary,
    mode: problem.mode,
  };
}

export function Thread({
  initial,
  ai,
  categoryLabels,
  environments,
  autoStart,
}: {
  initial: ProblemView;
  ai: { gemini: boolean; claude: boolean };
  categoryLabels: Record<string, string>;
  environments: EnvironmentOption[];
  autoStart: boolean;
}) {
  const router = useRouter();
  const [problem, setProblem] = useState(initial.problem);
  const [messages, setMessages] = useState(initial.messages);
  const [similar, setSimilar] = useState(initial.similar);
  const [research, setResearch] = useState(() => toResearch(initial.problem));
  const [streaming, setStreaming] = useState<{ text: string; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const composer = useRef<ReplyComposerHandle>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const id = problem.id;

  const refresh = useCallback(async () => {
    try {
      const view = await api<ProblemView>(`/api/problems/${id}`);
      setProblem(view.problem);
      setMessages(view.messages);
      setSimilar(view.similar);
      setResearch(toResearch(view.problem));
    } catch {
      // keep what we have
    }
  }, [id]);

  const scrollToBottom = useCallback((force = false) => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (force || nearBottom) bottom.current?.scrollIntoView({ block: 'end' });
  }, []);

  const runTurn = useCallback(
    async (request: TurnRequest): Promise<boolean> => {
      setError(null);
      if (request.kind) {
        const optimistic: Message = {
          id: -Date.now(),
          problemId: id,
          role: 'user',
          kind: request.kind,
          content: request.content ?? '',
          attachments: request.attachments ?? [],
          provider: null,
          model: null,
          sources: [],
          createdAt: Date.now(),
        };
        setMessages((list) => [...list, optimistic]);
      }
      if (request.regenerate) {
        setMessages((list) => (list[list.length - 1]?.role === 'assistant' ? list.slice(0, -1) : list));
      }
      setStreaming({ text: '', status: 'Starting…' });
      requestAnimationFrame(() => scrollToBottom(true));

      // Deltas arrive faster than React needs to paint; flush once per frame.
      let text = '';
      let frame = 0;
      const flush = () => {
        frame = 0;
        setStreaming((s) => (s ? { ...s, text } : s));
        scrollToBottom();
      };

      let failed: string | null = null;
      try {
        const response = await fetch(`/api/problems/${id}/turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          if (response.status === 401) window.location.href = '/login';
          throw new Error(data.error ?? `Request failed (${response.status})`);
        }
        for await (const event of readNdjson<StreamEvent>(response)) {
          switch (event.type) {
            case 'status':
              setStreaming((s) => (s ? { ...s, status: event.text } : s));
              break;
            case 'delta':
              text += event.text;
              if (!frame) frame = requestAnimationFrame(flush);
              break;
            case 'similar':
              setSimilar(event.items);
              break;
            case 'meta':
              setProblem((p) => ({ ...p, title: event.title, categories: event.categories, summary: event.summary, mode: event.mode }));
              break;
            case 'research':
              setResearch((r) => ({ ...r, status: event.status }));
              break;
            case 'error':
              failed = event.message;
              break;
            default:
              break;
          }
        }
      } catch (e) {
        failed = e instanceof Error ? e.message : 'Something went wrong.';
      }
      if (frame) cancelAnimationFrame(frame);
      await refresh();
      setStreaming(null);
      if (failed) setError(failed);
      notifyProblemsChanged();
      requestAnimationFrame(() => scrollToBottom(true));
      return !failed;
    },
    [id, refresh, scrollToBottom],
  );

  // First step for a problem that was just logged.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (autoStart) {
      router.replace(`/p/${id}`, { scroll: false });
      if (!initial.messages.some((m) => m.role === 'assistant')) void runTurn({});
    }
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }));
  }, [autoStart, id, initial.messages, router, runTurn]);

  // Poll while background work is in flight (research, or the classifier's title).
  const waitingForTitle = !problem.title && messages.some((m) => m.role === 'assistant');
  useEffect(() => {
    if (research.status !== 'running' && !waitingForTitle) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const snap = await api<ResearchSnapshot>(`/api/problems/${id}/research`);
        setResearch(snap);
        if (snap.title) setProblem((p) => ({ ...p, title: snap.title, categories: snap.categories, summary: snap.summary, mode: snap.mode }));
        if (snap.title && waitingForTitle) notifyProblemsChanged();
      } catch {
        // try again next tick
      }
      if (tries > 80) clearInterval(timer);
    }, 2500);
    return () => clearInterval(timer);
  }, [research.status, waitingForTitle, id]);

  async function submitReport(value: ComposerSubmit): Promise<boolean> {
    if (value.kind === 'worked') {
      setResolving(true);
      try {
        const view = await api<ProblemView>(`/api/problems/${id}/resolve`, { method: 'POST', json: { note: value.content } });
        setProblem(view.problem);
        setMessages(view.messages);
        notifyProblemsChanged();
        requestAnimationFrame(() => scrollToBottom(true));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not mark it resolved.');
        return false;
      } finally {
        setResolving(false);
      }
    }
    return runTurn({ kind: value.kind, content: value.content, attachments: value.attachments, search: value.search });
  }

  async function digDeeper() {
    try {
      const snap = await api<ResearchSnapshot>(`/api/problems/${id}/research`, { method: 'POST' });
      setResearch(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start research.');
    }
  }

  async function reopen() {
    await api(`/api/problems/${id}`, { method: 'PATCH', json: { status: 'open' } });
    await refresh();
    notifyProblemsChanged();
  }

  const busy = Boolean(streaming) || resolving;
  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant');
  const lastIsUser = messages[messages.length - 1]?.role === 'user';
  const isOpen = problem.status === 'open';
  const needsFirstStep = !streaming && !messages.some((m) => m.role === 'assistant');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header
        problem={problem}
        categoryLabels={categoryLabels}
        environments={environments}
        onResolve={() => composer.current?.startResolve()}
        onReopen={reopen}
        onChanged={(p) => {
          setProblem(p);
          notifyProblemsChanged();
        }}
        onDeleted={() => {
          notifyProblemsChanged();
          router.push('/');
        }}
      />

      <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
          <ResearchBar research={research} canStart={ai.gemini && !needsFirstStep} onOpen={() => setDrawer(true)} onDigDeeper={digDeeper} />

          {messages.map((m, index) => (
            <div key={m.id}>
              {m.role === 'user' ? (
                <UserBubble message={m} />
              ) : (
                <StepBlock
                  message={m}
                  problemId={id}
                  isLatest={index === lastAssistant && !streaming}
                  canAct={isOpen && !busy && index === messages.length - 1}
                  claudeAvailable={ai.claude}
                  retryLabel={problem.mode === 'fix' ? 'Try another way' : 'Regenerate'}
                  onThinkHarder={() => void runTurn({ regenerate: true, provider: 'claude' })}
                  onRetry={() => void runTurn({ regenerate: true, provider: 'gemini' })}
                />
              )}
              {m.kind === 'start' && similar.length > 0 && <SimilarBanner items={similar} />}
            </div>
          ))}

          {streaming && <StreamingStep text={streaming.text} status={streaming.status} />}

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <span className="min-w-0 flex-1 break-words">{error}</span>
              {lastIsUser && (
                <button
                  onClick={() => void runTurn({ regenerate: true })}
                  className="flex shrink-0 items-center gap-1 font-medium hover:underline"
                >
                  <RotateCcw className="size-3.5" /> Retry
                </button>
              )}
            </div>
          )}

          {needsFirstStep && !error && isOpen && ai.gemini && (
            <button
              onClick={() => void runTurn({})}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Get an answer
            </button>
          )}

          {!isOpen && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="size-5" /> {problem.mode === 'fix' ? 'Resolved' : 'Done'}
                  {problem.resolvedAt && (
                    <span className="text-sm font-normal text-emerald-700/80 dark:text-emerald-400/80" suppressHydrationWarning>
                      {shortDate(problem.resolvedAt)}
                    </span>
                  )}
                </p>
                <button onClick={reopen} className="text-sm text-emerald-800 hover:underline dark:text-emerald-300">
                  Reopen
                </button>
              </div>
              {problem.resolution && <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-200">{problem.resolution}</p>}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-zinc-100 bg-white pt-3 dark:border-zinc-900 dark:bg-zinc-950">
          {!ai.gemini && (
            <p className="mx-auto max-w-3xl px-4 pb-2 text-xs text-amber-700 dark:text-amber-400">
              GEMINI_API_KEY isn&apos;t set on the server yet, so the AI can&apos;t answer.
            </p>
          )}
          <ReplyComposer ref={composer} mode={problem.mode} busy={busy} disabled={needsFirstStep} onSubmit={submitReport} />
        </div>
      )}

      {drawer && <ResearchDrawer research={research} onClose={() => setDrawer(false)} onDigDeeper={digDeeper} />}
    </div>
  );
}

function SimilarBanner({ items }: { items: SimilarProblem[] }) {
  return (
    <div className="mt-4 space-y-2">
      {items.map((s) => (
        <Link
          key={s.id}
          href={`/p/${s.id}`}
          className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm transition hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:border-amber-800"
        >
          <History className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-amber-950 dark:text-amber-100">
              <span className="font-medium">
                {s.score > 0 ? 'This sounds like' : 'Possibly related:'} an issue from{' '}
                <span suppressHydrationWarning>{longDate(s.createdAt)}</span>
                {s.environmentName ? ` at ${s.environmentName}` : ''}
                {s.reporter ? ` (${s.reporter})` : ''}:
              </span>{' '}
              {s.summary || s.title || s.description}
            </p>
            <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">
              {s.resolution ? <>Fixed by: {s.resolution}</> : s.status === 'open' ? 'Still open.' : 'Resolved, no fix recorded.'}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Header({
  problem,
  categoryLabels,
  environments,
  onResolve,
  onReopen,
  onChanged,
  onDeleted,
}: {
  problem: Problem;
  categoryLabels: Record<string, string>;
  environments: EnvironmentOption[];
  onResolve: () => void;
  onReopen: () => void;
  onChanged: (problem: Problem) => void;
  onDeleted: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<'title' | 'reporter' | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!editing) return;
    const field = editing;
    setEditing(null);
    try {
      const { problem: updated } = await api<{ problem: Problem }>(`/api/problems/${problem.id}`, {
        method: 'PATCH',
        json: { [field]: draft.trim() },
      });
      onChanged(updated);
    } catch {
      // leave it as it was
    }
  }

  async function patch(json: Record<string, unknown>) {
    try {
      const { problem: updated } = await api<{ problem: Problem }>(`/api/problems/${problem.id}`, { method: 'PATCH', json });
      onChanged(updated);
    } catch {
      // leave it as it was
    }
  }

  async function remove() {
    setMenu(false);
    if (!window.confirm('Delete this problem and its whole history? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api(`/api/problems/${problem.id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const title = problem.title || problem.description.split('\n')[0].slice(0, 90);

  return (
    <header className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3 pl-14 md:pl-6 dark:border-zinc-900">
      <div className="min-w-0 flex-1">
        {editing === 'title' ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(null);
            }}
            className="w-full rounded-md bg-zinc-100 px-2 py-0.5 text-lg font-semibold outline-none dark:bg-zinc-800"
          />
        ) : (
          <h1 className="group flex items-center gap-2 truncate text-lg font-semibold tracking-tight">
            <span className="truncate">{title}</span>
            <button
              aria-label="Rename"
              onClick={() => {
                setDraft(problem.title ?? title);
                setEditing('title');
              }}
              className="shrink-0 text-zinc-400 opacity-0 transition hover:text-zinc-700 group-hover:opacity-100 dark:hover:text-zinc-200"
            >
              <Pencil className="size-3.5" />
            </button>
          </h1>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          {editing === 'reporter' ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') setEditing(null);
              }}
              placeholder="Who reported it?"
              className="rounded bg-zinc-100 px-1.5 py-0.5 outline-none dark:bg-zinc-800"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(problem.reporter ?? '');
                setEditing('reporter');
              }}
              className="flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200"
              title="Edit who reported it"
            >
              <User className="size-3.5" /> {problem.reporter || 'Add reporter'}
            </button>
          )}
          <span>·</span>
          <time suppressHydrationWarning>{longDate(problem.createdAt)}</time>
          <ChipSelect
            icon={<Building2 className="size-3.5" />}
            label="Environment"
            value={problem.environmentId ?? ''}
            onChange={(value) => void patch({ environmentId: value || null })}
            options={[...environments.map((e) => ({ value: e.id, label: e.name })), { value: '', label: 'No environment' }]}
          />
          <ChipSelect
            icon={<ModeIcon mode={problem.mode} />}
            label="Request type"
            value={problem.mode}
            onChange={(value) => void patch({ mode: value })}
            options={MODES.map((m) => ({ value: m.key, label: m.label }))}
          />
          {problem.categories.map((c) => (
            <span key={c} className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {categoryLabels[c] ?? c}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {problem.status === 'open' ? (
          <button
            onClick={onResolve}
            className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 sm:flex dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <CheckCircle2 className="size-4 text-emerald-600" /> {problem.mode === 'fix' ? 'Mark resolved' : 'Mark done'}
          </button>
        ) : (
          <span className="hidden items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 sm:flex dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" /> {problem.mode === 'fix' ? 'Resolved' : 'Done'}
          </span>
        )}
        <div className="relative">
          <button
            aria-label="More actions"
            onClick={() => setMenu((v) => !v)}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </button>
          {menu && (
            <>
              <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {problem.status === 'open' ? (
                  <MenuItem
                    onClick={() => {
                      setMenu(false);
                      onResolve();
                    }}
                  >
                    <CheckCircle2 className="size-4" /> {problem.mode === 'fix' ? 'Mark resolved' : 'Mark done'}
                  </MenuItem>
                ) : (
                  <MenuItem
                    onClick={() => {
                      setMenu(false);
                      onReopen();
                    }}
                  >
                    <RotateCcw className="size-4" /> Reopen
                  </MenuItem>
                )}
                <MenuItem onClick={remove} danger>
                  <Trash2 className="size-4" /> Delete problem
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
        danger && 'text-red-600 dark:text-red-400',
      )}
    >
      {children}
    </button>
  );
}

function ModeIcon({ mode }: { mode: Problem['mode'] }) {
  const Icon = MODE_ICONS[mode];
  return <Icon className="size-3.5" />;
}

/** A small pill that is really a native select: accessible and works on phones. */
function ChipSelect({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label
      title={label}
      className="flex cursor-pointer items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {icon}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[10rem] cursor-pointer truncate bg-transparent outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
