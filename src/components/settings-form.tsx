'use client';

import { Building2, Check, CheckCircle2, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/client';
import type { Environment, EnvironmentSummary } from '@/lib/types';

const PROFILE_TEMPLATE = `- Identity & email: (Google Workspace / Microsoft 365 / Okta…)
- Devices: (MDM, Mac/Windows mix, how many)
- Communication: (Slack / Teams…)
- Key apps:
- Quirks, policies, things to avoid:`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveButton({ state, disabled, onClick, label = 'Save' }: { state: SaveState; disabled: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'saving'}
      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
    >
      {state === 'saving' ? <Loader2 className="size-4 animate-spin" /> : state === 'saved' ? <Check className="size-4" /> : null}
      {state === 'saved' ? 'Saved' : label}
    </button>
  );
}

export function SettingsForm({
  about,
  defaultAbout,
  environments,
  ai,
  fastModel,
  researchModel,
  rememberDays,
}: {
  about: string;
  defaultAbout: string;
  environments: EnvironmentSummary[];
  ai: { gemini: boolean; claude: boolean; geminiModel: string; claudeModel: string };
  fastModel: string;
  researchModel: string;
  rememberDays: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(about);
  const [saved, setSaved] = useState(about);
  const [state, setState] = useState<SaveState>('idle');
  const [adding, setAdding] = useState(false);

  async function saveAbout() {
    setState('saving');
    try {
      const data = await api<{ about: string }>('/api/settings', { method: 'PUT', json: { about: value } });
      setValue(data.about);
      setSaved(data.about);
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
    }
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-12 px-4 py-10 pl-14 md:pl-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">About you</h2>
            <p className="text-sm text-zinc-500">Sent with every chat, whichever client it is for.</p>
          </div>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex items-center gap-2">
            <SaveButton state={state} disabled={value === saved} onClick={saveAbout} />
            <button
              onClick={() => setValue(defaultAbout)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Reset to default
            </button>
            {state === 'error' && <span className="text-sm text-red-600">Could not save.</span>}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold">Environments</h2>
              <p className="text-sm text-zinc-500">
                One per client. Answers use that client&apos;s stack, but past problems from every environment are still
                matched, so a fix from one client can help another.
              </p>
            </div>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <Plus className="size-4" /> Add
              </button>
            )}
          </div>

          {adding && (
            <EnvironmentCard
              key="new"
              initial={{ id: '', name: '', profile: PROFILE_TEMPLATE }}
              problemCount={0}
              onDone={() => {
                setAdding(false);
                router.refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {environments.map((e) => (
            <EnvironmentCard key={e.id} initial={e} problemCount={e.problemCount} onDone={() => router.refresh()} />
          ))}
          {environments.length === 0 && !adding && <p className="text-sm text-zinc-500">No environments yet.</p>}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">AI</h2>
          <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
            <Row
              ok={ai.gemini}
              name="Gemini"
              detail={
                ai.gemini
                  ? `Answers: ${ai.geminiModel} · Research: ${researchModel} · Titles, summaries & commands: ${fastModel}`
                  : 'Set GEMINI_API_KEY in .env and restart the container.'
              }
            />
            <Row
              ok={ai.claude}
              name="Claude (Think harder)"
              detail={ai.claude ? ai.claudeModel : 'Optional. Set ANTHROPIC_API_KEY in .env to enable the Think harder button.'}
            />
          </div>
          <p className="text-xs text-zinc-500">
            Models and keys live in the server&apos;s .env file. &quot;Remember me&quot; lasts {rememberDays} days from your last visit.
          </p>
        </section>
      </div>
    </div>
  );
}

function EnvironmentCard({
  initial,
  problemCount,
  onDone,
  onCancel,
}: {
  initial: Pick<Environment, 'id' | 'name' | 'profile'>;
  problemCount: number;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const isNew = !initial.id;
  const [name, setName] = useState(initial.name);
  const [profile, setProfile] = useState(initial.profile);
  const [saved, setSaved] = useState({ name: initial.name, profile: initial.profile });
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== saved.name || profile !== saved.profile;

  async function save() {
    setState('saving');
    setError(null);
    try {
      if (isNew) {
        await api('/api/environments', { method: 'POST', json: { name, profile } });
      } else {
        await api(`/api/environments/${initial.id}`, { method: 'PATCH', json: { name, profile } });
        setSaved({ name, profile });
      }
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setState('error');
    }
  }

  async function remove() {
    const warning = problemCount
      ? `Delete "${initial.name}"? Its ${problemCount} chat(s) are kept but become unassigned.`
      : `Delete "${initial.name}"?`;
    if (!window.confirm(warning)) return;
    try {
      await api(`/api/environments/${initial.id}`, { method: 'DELETE' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 shrink-0 text-zinc-500" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Client name"
          autoFocus={isNew}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 font-medium outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800"
        />
        {!isNew && <span className="shrink-0 text-xs text-zinc-500">{problemCount} chat{problemCount === 1 ? '' : 's'}</span>}
      </div>
      <textarea
        value={profile}
        onChange={(e) => setProfile(e.target.value)}
        rows={6}
        placeholder="Tools, plans and policies this client runs"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex items-center gap-2">
        <SaveButton state={state} disabled={!name.trim() || (!isNew && !dirty)} onClick={save} label={isNew ? 'Add environment' : 'Save'} />
        {isNew ? (
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Cancel
          </button>
        ) : (
          <button
            onClick={remove}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function Row({ ok, name, detail }: { ok: boolean; name: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-zinc-400" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="break-words text-sm text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}
