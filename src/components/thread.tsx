'use client';

import { Building2, CheckCircle2, ChevronDown, History, Loader2, MoreHorizontal, Pencil, RotateCcw, Sparkles, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ErrorNotice } from '@/components/error-notice';
import { MODE_ICONS } from '@/components/mode-icon';
import { OUTCOME_STYLE } from '@/components/outcome';
import { ReplyComposer, type ComposerSubmit, type ReplyComposerHandle } from '@/components/reply-composer';
import { ResearchBar, ResearchDrawer } from '@/components/research';
import { ResolutionSummary } from '@/components/resolution-summary';
import type { EnvironmentOption } from '@/components/sidebar';
import { AnswerBlock, ReportBubble, RequestCard, StepItem, StreamingAnswer } from '@/components/step';
import { api, cn, longDate, notifyProblemsChanged, readNdjson } from '@/lib/client';
import { MODES, modeLabel } from '@/lib/modes';
import { outcomeLead, outcomeOf } from '@/lib/outcomes';
import { groupSteps, isRevising } from '@/lib/steps';
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
  // A reply still being written on the server when the page loaded is shown live.
  const [streaming, setStreaming] = useState<{ text: string; status: string | null } | null>(initial.live);
  const [rejoining, setRejoining] = useState(Boolean(initial.live));
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const composer = useRef<ReplyComposerHandle>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const localTurn = useRef(false);
  const id = problem.id;

  const applyView = useCallback((view: ProblemView) => {
    setProblem(view.problem);
    setMessages(view.messages);
    setSimilar(view.similar);
    setResearch(toResearch(view.problem));
  }, []);

  /** Reload from the server; rejoins a reply that is still being written. */
  const refresh = useCallback(async () => {
    try {
      const view = await api<ProblemView>(`/api/problems/${id}`);
      applyView(view);
      if (view.live && !localTurn.current) {
        setStreaming(view.live);
        setRejoining(true);
      }
    } catch {
      // keep what we have
    }
  }, [id, applyView]);

  const scrollToBottom = useCallback((force = false) => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (force || nearBottom) bottom.current?.scrollIntoView({ block: 'end' });
  }, []);

  /**
   * Sends a message and streams the reply. Resolves true once the server has
   * accepted the message, even if the reply then fails (the message is saved
   * and the error offers Retry), so the composer only restores text it lost.
   */
  const runTurn = useCallback(
    async (request: TurnRequest): Promise<boolean> => {
      localTurn.current = true;
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
      let accepted = false;
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
        accepted = true;
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
      localTurn.current = false;
      await refresh();
      setStreaming((s) => (rejoiningRef.current ? s : null));
      if (failed) setError(failed);
      notifyProblemsChanged();
      requestAnimationFrame(() => scrollToBottom(true));
      return accepted;
    },
    [id, refresh, scrollToBottom],
  );

  // Lets runTurn see whether a rejoin started while it was finishing.
  const rejoiningRef = useRef(rejoining);
  rejoiningRef.current = rejoining;

  // First reply for a chat that was just logged; otherwise make sure the page
  // isn't a stale copy (the browser can reuse an old render of this chat).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (autoStart) {
      router.replace(`/p/${id}`, { scroll: false });
      if (!initial.messages.some((m) => m.role === 'assistant')) void runTurn({});
    } else if (!initial.live) {
      void refresh();
    }
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }));
  }, [autoStart, id, initial.messages, initial.live, router, runTurn, refresh]);

  // Coming back to the tab picks up anything that changed meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !localTurn.current) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Follow a reply that the server is still writing until it is saved.
  useEffect(() => {
    if (!rejoining) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const view = await api<ProblemView>(`/api/problems/${id}`);
        if (stopped) return;
        if (view.live) {
          setStreaming(view.live);
          scrollToBottom();
        } else {
          applyView(view);
          setStreaming(null);
          setRejoining(false);
          notifyProblemsChanged();
          requestAnimationFrame(() => scrollToBottom(true));
        }
      } catch {
        // try again next tick
      }
    }, 900);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [rejoining, id, applyView, scrollToBottom]);

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
    if (value.kind === 'worked' && value.outcome) {
      setResolving(true);
      try {
        const view = await api<ProblemView>(`/api/problems/${id}/resolve`, {
          method: 'POST',
          json: { note: value.content, outcome: value.outcome },
        });
        applyView(view);
        setShowAll(false);
        notifyProblemsChanged();
        toast.success(value.outcome === 'unresolved' ? 'Closed and saved for next time' : 'Resolved and saved for next time');
        requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not close the chat.');
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
    toast('Reopened');
  }

  const busy = Boolean(streaming) || resolving;
  const isOpen = problem.status === 'open';
  const fixing = problem.mode === 'fix';
  const start = messages.find((m) => m.kind === 'start');
  const rest = messages.filter((m) => m !== start);
  const last = messages[messages.length - 1];
  const needsFirstStep = !streaming && !messages.some((m) => m.role === 'assistant');
  const lastIsUser = last?.role === 'user';
  const { steps, loose } = groupSteps(messages);
  // A question about the current step: its new version streams in place.
  const revising = fixing && Boolean(streaming) && isRevising(messages);
  const actions = {
    problemId: id,
    claudeAvailable: ai.claude,
    retryLabel: fixing ? 'Try another way' : 'Regenerate',
    onThinkHarder: () => void runTurn({ regenerate: true, provider: 'claude' }),
    onRetry: () => void runTurn({ regenerate: true, provider: 'gemini' }),
  };
  const showConversation = isOpen || showAll;

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
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:py-8">
          {start && <RequestCard message={start} reporter={problem.reporter} />}

          {!isOpen && (
            <ResolutionSummary
              problem={problem}
              steps={steps}
              showingAll={showAll}
              onToggle={() => setShowAll((v) => !v)}
              onReopen={reopen}
            />
          )}

          {showConversation && (
            <>
              {isOpen && similar.length > 0 && <SimilarCards items={similar} />}
              {isOpen && (
                <ResearchBar research={research} canStart={ai.gemini && !needsFirstStep} onOpen={() => setDrawer(true)} onDigDeeper={digDeeper} />
              )}

              {loose.map((m) => (
                <ReportBubble key={m.id} message={m} />
              ))}

              {fixing ? (
                (steps.length > 0 || streaming) && (
                  <ol className="pt-2">
                    {steps.map((s, index) => {
                      const latest = index === steps.length - 1;
                      const isLatest = latest && (!streaming || revising);
                      return (
                        <StepItem
                          key={s.versions[0].id}
                          number={index + 1}
                          group={s}
                          isLatest={isLatest}
                          isLast={latest && (!streaming || revising)}
                          streaming={latest && revising ? streaming : null}
                          canAct={isOpen && !busy && isLatest && s.reports.length === 0 && last?.role === 'assistant'}
                          {...actions}
                        />
                      );
                    })}
                    {streaming && !revising && (
                      <StreamingAnswer text={streaming.text} status={streaming.status} variant="step" number={steps.length + 1} />
                    )}
                  </ol>
                )
              ) : (
                <div className="space-y-6 pt-1">
                  {rest.map((m, index) =>
                    m.role === 'user' ? (
                      <ReportBubble key={m.id} message={m} />
                    ) : (
                      <AnswerBlock key={m.id} message={m} canAct={isOpen && !busy && index === rest.length - 1} {...actions} />
                    ),
                  )}
                  {streaming && <StreamingAnswer text={streaming.text} status={streaming.status} variant="chat" number={0} />}
                </div>
              )}
            </>
          )}

          {error && (
            <ErrorNotice
              error={error}
              context="ai"
              onRetry={lastIsUser || needsFirstStep ? () => void runTurn({ regenerate: true }) : undefined}
            />
          )}

          {needsFirstStep && !error && isOpen && ai.gemini && (
            <button
              onClick={() => void runTurn({})}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110"
            >
              <Sparkles className="size-4" /> Get an answer
            </button>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {isOpen && (
        <div className="bg-gradient-to-t from-white via-white to-white/0 pt-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950/0">
          {!ai.gemini && (
            <p className="mx-auto max-w-3xl px-4 pb-2 text-xs text-amber-700 dark:text-amber-400">
              GEMINI_API_KEY isn&apos;t set on the server yet, so the AI can&apos;t answer.
            </p>
          )}
          <ReplyComposer ref={composer} mode={problem.mode} busy={busy} disabled={needsFirstStep && !streaming} onSubmit={submitReport} />
        </div>
      )}

      {drawer && <ResearchDrawer research={research} onClose={() => setDrawer(false)} onDigDeeper={digDeeper} />}
    </div>
  );
}

function SimilarCards({ items }: { items: SimilarProblem[] }) {
  return (
    <div className="space-y-2">
      {items.map((s) => {
        const kind = s.status === 'resolved' ? outcomeOf(s.resolutionKind, true) : null;
        const OutcomeIcon = kind ? OUTCOME_STYLE[kind].icon : null;
        return (
          <Link
            key={s.id}
            href={`/p/${s.id}`}
            className="group flex animate-fade-up gap-3 rounded-xl bg-amber-500/[0.06] px-4 py-3 text-sm ring-1 ring-inset ring-amber-500/20 transition hover:bg-amber-500/[0.1]"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <History className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80">
                Seen before · <span suppressHydrationWarning>{longDate(s.createdAt)}</span>
                {s.environmentName ? ` · ${s.environmentName}` : ''}
                {s.reporter ? ` · ${s.reporter}` : ''}
              </p>
              <p className="mt-0.5 text-zinc-800 dark:text-zinc-200">{s.summary || s.title || s.description}</p>
              {s.reason && <p className="mt-1 text-xs italic text-zinc-500">Why it matches: {s.reason}</p>}
              <p className="mt-1.5 flex items-start gap-1.5 text-zinc-600 dark:text-zinc-400">
                {kind && s.resolution ? (
                  <>
                    {OutcomeIcon && <OutcomeIcon className={cn('mt-0.5 size-3.5 shrink-0', OUTCOME_STYLE[kind].text)} />}
                    <span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{outcomeLead(kind)}</span> {s.resolution}
                    </span>
                  </>
                ) : s.status === 'open' ? (
                  'Still open.'
                ) : (
                  'Closed, no outcome recorded.'
                )}
              </p>
            </div>
          </Link>
        );
      })}
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

  async function patch(json: Record<string, unknown>, done: string) {
    try {
      const { problem: updated } = await api<{ problem: Problem }>(`/api/problems/${problem.id}`, { method: 'PATCH', json });
      onChanged(updated);
      toast.success(done);
    } catch (e) {
      toast.error("Couldn't save that", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function remove() {
    setMenu(false);
    if (!window.confirm('Delete this chat and its whole history? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api(`/api/problems/${problem.id}`, { method: 'DELETE' });
      toast('Chat deleted');
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const title = problem.title || problem.description.split('\n')[0].slice(0, 90);
  const envName = (envId: string) => environments.find((e) => e.id === envId)?.name ?? 'No environment';
  const done = problem.status !== 'open';
  const doneKind = outcomeOf(problem.resolutionKind, problem.mode === 'fix');
  const DoneIcon = OUTCOME_STYLE[doneKind].icon;

  return (
    <header className="z-20 flex items-start gap-3 border-b border-zinc-200/70 bg-white/85 px-4 py-3 pl-14 backdrop-blur-md md:px-6 dark:border-zinc-800/70 dark:bg-zinc-950/85">
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
            className="w-full rounded-lg bg-zinc-100 px-2 py-0.5 text-[17px] font-semibold outline-none ring-2 ring-accent/40 dark:bg-zinc-800"
          />
        ) : (
          <h1 className="group flex items-center gap-2 truncate text-[17px] font-semibold tracking-tight">
            <span className="truncate">{title}</span>
            <button
              aria-label="Rename"
              onClick={() => {
                setDraft(problem.title ?? title);
                setEditing('title');
              }}
              className="shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition hover:text-zinc-700 group-hover:opacity-100 dark:hover:text-zinc-200"
            >
              <Pencil className="size-3.5" />
            </button>
          </h1>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
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
              className="rounded-full bg-zinc-100 px-2.5 py-1 outline-none ring-2 ring-accent/40 dark:bg-zinc-800"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(problem.reporter ?? '');
                setEditing('reporter');
              }}
              className={chipClass}
              title="Edit who reported it"
            >
              <User className="size-3.5" /> {problem.reporter || 'Add reporter'}
            </button>
          )}
          <ChipSelect
            icon={<Building2 className="size-3.5" />}
            label="Environment"
            value={problem.environmentId ?? ''}
            onChange={(value) => void patch({ environmentId: value || null }, `Moved to ${envName(value)}`)}
            options={[...environments.map((e) => ({ value: e.id, label: e.name })), { value: '', label: 'No environment' }]}
          />
          <ChipSelect
            icon={<ModeIcon mode={problem.mode} />}
            label="Request type"
            value={problem.mode}
            onChange={(value) => void patch({ mode: value }, `Switched to ${modeLabel(value as Problem['mode'])}`)}
            options={MODES.map((m) => ({ value: m.key, label: m.label, icon: <ModeIcon mode={m.key} /> }))}
          />
          {problem.categories.map((c) => (
            <span key={c} className="hidden rounded-full px-2 py-1 text-zinc-500 ring-1 ring-inset ring-zinc-200 sm:inline dark:ring-zinc-800">
              {categoryLabels[c] ?? c}
            </span>
          ))}
          <time suppressHydrationWarning className="pl-1 text-zinc-400">
            {longDate(problem.createdAt)}
          </time>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!done ? (
          <button
            onClick={onResolve}
            className="hidden items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-zinc-200 transition hover:ring-zinc-300 sm:flex dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-700"
          >
            <CheckCircle2 className="size-4 text-emerald-600" /> {problem.mode === 'fix' ? 'Mark resolved' : 'Mark done'}
          </button>
        ) : (
          <span className={cn('hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset sm:flex', OUTCOME_STYLE[doneKind].badge)}>
            <DoneIcon className="size-3.5" /> Closed
          </span>
        )}
        <div className="relative">
          <button
            aria-label="More actions"
            onClick={() => setMenu((v) => !v)}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </button>
          {menu && (
            <>
              <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-52 animate-pop-in overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lift dark:border-zinc-700 dark:bg-zinc-900">
                {!done ? (
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
                  <Trash2 className="size-4" /> Delete chat
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const chipClass =
  'inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100';

function MenuItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800',
        danger && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40',
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

/** A small pill in the header that opens a themed picker. */
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
  options: DropdownOption<string>[];
  onChange: (value: string) => void;
}) {
  return (
    <Dropdown
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className={chipClass}
      renderTrigger={(selected) => (
        <>
          {icon}
          <span className="max-w-[10rem] truncate">{selected?.label ?? label}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </>
      )}
    />
  );
}
