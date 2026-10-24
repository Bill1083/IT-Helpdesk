'use client';

import {
  AppWindow,
  Building2,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  Loader2,
  Plug,
  Plus,
  Sparkles,
  KeyRound,
  Trash2,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorDetails, ErrorNotice, HintText } from '@/components/error-notice';
import { useInstallPrompt } from '@/components/pwa';
import { api, cn, shortDate } from '@/lib/client';
import { explainError } from '@/lib/errors';
import type { Account, BackupStatus, ConnectionCheck, Environment, EnvironmentSummary } from '@/lib/types';

const PROFILE_TEMPLATE = `- Identity & email: (Google Workspace / Microsoft 365 / Okta…)
- Devices: (MDM, Mac/Windows mix, how many)
- Communication: (Slack / Teams…)
- Key apps:
- Quirks, policies, things to avoid:`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const inputClass =
  'w-full rounded-xl bg-white px-3.5 py-2.5 text-sm leading-relaxed outline-none ring-1 ring-zinc-200 transition focus:ring-2 focus:ring-accent/40 dark:bg-zinc-950 dark:ring-zinc-800';

function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:ring-zinc-300 disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800 dark:hover:ring-zinc-700',
        className,
      )}
    >
      {children}
    </button>
  );
}

function SaveButton({ state, disabled, onClick, label = 'Save' }: { state: SaveState; disabled: boolean; onClick: () => void; label?: string }) {
  return (
    <PrimaryButton onClick={onClick} disabled={disabled || state === 'saving'}>
      {state === 'saving' ? <Loader2 className="size-4 animate-spin" /> : state === 'saved' ? <Check className="size-4" /> : null}
      {state === 'saved' ? 'Saved' : label}
    </PrimaryButton>
  );
}

/** A settings card: icon, title, one-line description, then the controls. */
function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/90 sm:p-6 dark:bg-zinc-900/60 dark:ring-zinc-800">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingsForm({
  account,
  about,
  defaultAbout,
  environments,
  ai,
  fastModel,
  researchModel,
  rememberDays,
  backup,
  backupKeepDays,
  accounts,
}: {
  account: { name: string; isOwner: boolean };
  about: string;
  defaultAbout: string;
  environments: EnvironmentSummary[];
  ai: { gemini: boolean; claude: boolean; geminiModel: string; claudeModel: string };
  fastModel: string;
  researchModel: string;
  rememberDays: number;
  /** Owner only; null for everyone else. */
  backup: BackupStatus | null;
  backupKeepDays: number;
  /** Owner only; null for everyone else. */
  accounts: Account[] | null;
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
      toast.success('Saved');
      setTimeout(() => setState('idle'), 2000);
    } catch (e) {
      setState('error');
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-10 pl-14 md:px-6">
        <div className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">How IT Desk knows you, your clients, and where your data is kept safe.</p>
        </div>

        <Section icon={<UserRound className="size-[18px]" />} title="About you" description="Sent with every chat, whichever client it's for.">
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} className={inputClass} />
          <div className="mt-3 flex items-center gap-2">
            <SaveButton state={state} disabled={value === saved} onClick={saveAbout} />
            <button
              onClick={() => setValue(defaultAbout)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              Reset to default
            </button>
          </div>
        </Section>

        <Section
          icon={<Building2 className="size-[18px]" />}
          title="Environments"
          description="One per client. Answers use that client's stack, and past problems from every client are still matched."
          action={
            !adding && (
              <SecondaryButton onClick={() => setAdding(true)} className="shrink-0">
                <Plus className="size-4" /> Add
              </SecondaryButton>
            )
          }
        >
          <div className="space-y-3">
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
          </div>
        </Section>

        <PasswordSection isOwner={account.isOwner} />

        {accounts && <AccountsSection initial={accounts} />}

        <DesktopAppSection rememberDays={rememberDays} />

        {backup && <BackupSection initial={backup} keepDays={backupKeepDays} />}

        <Section icon={<Sparkles className="size-[18px]" />} title="AI" description="Keys and models live in the server's .env file.">
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl ring-1 ring-zinc-200/90 dark:divide-zinc-800 dark:ring-zinc-800">
            <StatusRow
              ok={ai.gemini}
              name="Gemini"
              detail={
                ai.gemini
                  ? `Answers ${ai.geminiModel} · research ${researchModel} · titles, summaries and commands ${fastModel}`
                  : 'Set GEMINI_API_KEY in .env and restart the container.'
              }
            />
            <StatusRow
              ok={ai.claude}
              name="Claude · Think harder"
              detail={ai.claude ? ai.claudeModel : 'Optional. Set ANTHROPIC_API_KEY in .env to turn on the Think harder button.'}
            />
          </div>
        </Section>
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
  const dirty = name !== saved.name || profile !== saved.profile;

  async function save() {
    setState('saving');
    try {
      if (isNew) {
        await api('/api/environments', { method: 'POST', json: { name, profile } });
        toast.success(`Added ${name}`);
      } else {
        await api(`/api/environments/${initial.id}`, { method: 'PATCH', json: { name, profile } });
        setSaved({ name, profile });
        toast.success(`Saved ${name}`);
      }
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
      onDone();
    } catch (e) {
      setState('error');
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function remove() {
    const warning = problemCount
      ? `Delete "${initial.name}"? Its ${problemCount} chat(s) are kept but become unassigned.`
      : `Delete "${initial.name}"?`;
    if (!window.confirm(warning)) return;
    try {
      await api(`/api/environments/${initial.id}`, { method: 'DELETE' });
      toast(`Deleted ${initial.name}`);
      onDone();
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className={cn('rounded-xl p-4 ring-1', isNew ? 'bg-accent/[0.04] ring-accent/25' : 'bg-zinc-50/60 ring-zinc-200/80 dark:bg-zinc-950/40 dark:ring-zinc-800')}>
      <div className="mb-2.5 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Client name"
          autoFocus={isNew}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 font-semibold outline-none transition focus:bg-white focus:ring-2 focus:ring-accent/40 dark:focus:bg-zinc-900"
        />
        {!isNew && (
          <span className="shrink-0 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {problemCount} chat{problemCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <textarea
        value={profile}
        onChange={(e) => setProfile(e.target.value)}
        rows={6}
        placeholder="Tools, plans and policies this client runs"
        className={cn(inputClass, 'font-mono text-[13px]')}
      />
      <div className="mt-3 flex items-center gap-2">
        <SaveButton state={state} disabled={!name.trim() || (!isNew && !dirty)} onClick={save} label={isNew ? 'Add environment' : 'Save'} />
        {isNew ? (
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Cancel
          </button>
        ) : (
          <button
            onClick={remove}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopAppSection({ rememberDays }: { rememberDays: number }) {
  const { canInstall, installed, install } = useInstallPrompt();
  return (
    <Section
      icon={<AppWindow className="size-[18px]" />}
      title="Desktop app"
      description="Its own window, Start menu entry and taskbar icon. History stays on your server, so it's the same everywhere."
    >
      {installed ? (
        <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" /> You&apos;re using the installed app
        </p>
      ) : canInstall ? (
        <PrimaryButton onClick={() => void install()}>
          <Download className="size-4" /> Install IT Desk
        </PrimaryButton>
      ) : (
        <ol className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Edge:</span> ⋯ menu → Apps → Install this site as an app
          </li>
          <li>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Chrome:</span> the install icon at the right of the address bar
          </li>
        </ol>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Tick &quot;Remember me&quot; when you sign in and the app stays signed in for {rememberDays} days after each use.
      </p>
    </Section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BackupSection({ initial, keepDays }: { initial: BackupStatus; keepDays: number }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checks, setChecks] = useState<ConnectionCheck[] | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function backupNow() {
    setBusy(true);
    setRequestError(null);
    try {
      const next = await api<BackupStatus>('/api/backup', { method: 'POST' });
      setStatus(next);
      const failed = next.lastError && (next.lastErrorAt ?? 0) > (next.lastAt ?? 0);
      if (failed) toast.error('Backup failed', { description: explainError(next.lastError!, 'backup').title });
      else toast.success('Backed up to R2');
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'Backup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    setChecks(null);
    setRequestError(null);
    try {
      const { checks: results } = await api<{ checks: ConnectionCheck[] }>('/api/backup/test', { method: 'POST' });
      setChecks(results);
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  }

  // Only show the last error if it is newer than the last success.
  const failing = Boolean(status.lastError && (!status.lastAt || (status.lastErrorAt ?? 0) > status.lastAt));

  return (
    <Section
      icon={<CloudUpload className="size-[18px]" />}
      title="Backups"
      description={`Once a day the database and screenshots are copied to your Cloudflare R2 bucket. Snapshots are kept for ${keepDays} days.`}
    >
      {!status.configured ? (
        <div className="flex items-start gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm ring-1 ring-zinc-200/80 dark:bg-zinc-950/40 dark:ring-zinc-800">
          <XCircle className="mt-0.5 size-4 shrink-0 text-zinc-400" />
          <p className="text-zinc-600 dark:text-zinc-400">
            <HintText text="Not set up yet. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to the server .env, then run `docker compose up -d`." />
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200/80 dark:bg-zinc-950/40 dark:ring-zinc-800">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                failing ? 'bg-red-500/10 text-red-600' : status.lastAt ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800',
              )}
            >
              {failing ? <XCircle className="size-4" /> : status.lastAt ? <CheckCircle2 className="size-4" /> : <CloudUpload className="size-4" />}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {failing ? 'Last backup attempt failed' : status.lastAt ? (
                  <>
                    Last backup <span suppressHydrationWarning>{shortDate(status.lastAt)}</span>
                    {status.lastSize ? ` · ${formatBytes(status.lastSize)}` : ''}
                  </>
                ) : (
                  'No backup yet'
                )}
              </p>
              <p className="truncate text-zinc-500">Bucket {status.bucket}</p>
            </div>
          </div>

          {failing && status.lastError && <ErrorNotice error={status.lastError} context="backup" />}

          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={backupNow} disabled={busy || status.running}>
              {busy || status.running ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
              {busy || status.running ? 'Backing up…' : 'Back up now'}
            </PrimaryButton>
            <SecondaryButton onClick={test} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test connection
            </SecondaryButton>
          </div>

          {checks && <ConnectionChecks checks={checks} />}
        </div>
      )}
      {requestError && <ErrorNotice error={requestError} context="backup" className="mt-4" />}
    </Section>
  );
}

/** The R2 test as a checklist: which stage passed, and where it stopped and why. */
function ConnectionChecks({ checks }: { checks: ConnectionCheck[] }) {
  const passed = checks.every((c) => c.ok) && checks.length === 5;
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl ring-1 ring-zinc-200/90 dark:ring-zinc-800">
      <p
        className={cn(
          'px-4 py-2.5 text-sm font-semibold',
          passed ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-red-500/10 text-red-800 dark:text-red-300',
        )}
      >
        {passed ? 'Everything checks out. Backups will work.' : 'Found the problem. Details below.'}
      </p>
      <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {checks.map((c) => (
          <li key={c.step} className="flex gap-3 px-4 py-3 text-sm">
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white',
                c.ok ? 'bg-emerald-500' : 'bg-red-500',
              )}
            >
              {c.ok ? <Check className="size-3" strokeWidth={3} /> : <XCircle className="size-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {c.step} <span className="font-normal text-zinc-500">· {c.detail}</span>
              </p>
              {c.hint && (
                <p className={cn('mt-1 leading-relaxed', c.ok ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400')}>
                  <HintText text={c.hint} />
                </p>
              )}
              {c.raw && <ErrorDetails raw={c.raw} code={explainError(c.raw, 'backup').code} className="mt-1.5 text-zinc-500" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A password shown exactly once, with a copy button. Used for new accounts and resets. */
function PasswordReveal({ password, onDone }: { password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 animate-pop-in rounded-xl bg-accent/[0.05] p-3.5 ring-1 ring-inset ring-accent/20">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
        Send this password to them. It&apos;s shown only this once.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm tracking-wide text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-800">
          {password}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-zinc-200 transition hover:ring-zinc-300 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-700"
        >
          {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        It&apos;s temporary: they&apos;ll be asked to choose their own password the first time they sign in.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-3 text-sm font-medium text-accent hover:underline"
      >
        Done
      </button>
    </div>
  );
}

function AccountsSection({ initial }: { initial: Account[] }) {
  const [accounts, setAccounts] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  async function refresh() {
    try {
      const { accounts: next } = await api<{ accounts: Account[] }>('/api/accounts');
      setAccounts(next);
    } catch {
      // keep the current list
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { password } = await api<{ account: Account; password: string }>('/api/accounts', {
        method: 'POST',
        json: { name: name.trim() },
      });
      setName('');
      setAdding(false);
      setNewPassword(password);
      await refresh();
    } catch (e) {
      toast.error("Couldn't create the account", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      icon={<Users className="size-[18px]" />}
      title="Accounts"
      description="A separate account for each person, told apart only by password. Their chats, environments and commands are private to them."
      action={
        !adding && (
          <SecondaryButton onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="size-4" /> Add
          </SecondaryButton>
        )
      }
    >
      <div className="space-y-3">
        {adding && (
          <div className="flex items-center gap-2 rounded-xl bg-accent/[0.04] p-3 ring-1 ring-accent/25">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
              placeholder="Their name"
              className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-zinc-200 focus:ring-2 focus:ring-accent/40 dark:bg-zinc-950 dark:ring-zinc-800"
            />
            <PrimaryButton onClick={create} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create
            </PrimaryButton>
            <button
              onClick={() => {
                setAdding(false);
                setName('');
              }}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        )}
        {newPassword && <PasswordReveal password={newPassword} onDone={() => setNewPassword(null)} />}

        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} onChanged={refresh} onPassword={setNewPassword} />
        ))}
      </div>
    </Section>
  );
}

function AccountRow({
  account,
  onChanged,
  onPassword,
}: {
  account: Account;
  onChanged: () => void;
  onPassword: (password: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [busy, setBusy] = useState(false);

  async function rename() {
    setEditing(false);
    if (!name.trim() || name === account.name) {
      setName(account.name);
      return;
    }
    try {
      await api(`/api/accounts/${account.id}`, { method: 'PATCH', json: { name: name.trim() } });
      toast.success('Renamed');
      onChanged();
    } catch (e) {
      setName(account.name);
      toast.error("Couldn't rename", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function resetPassword() {
    if (!window.confirm(`Reset ${account.name}'s password? Their current one stops working right away.`)) return;
    setBusy(true);
    try {
      const { password } = await api<{ password: string }>(`/api/accounts/${account.id}/password`, { method: 'POST' });
      onPassword(password);
    } catch (e) {
      toast.error("Couldn't reset the password", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${account.name}'s account? All of their chats, environments and commands are deleted too. This can't be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/accounts/${account.id}`, { method: 'DELETE' });
      toast(`Deleted ${account.name}`);
      onChanged();
    } catch (e) {
      toast.error("Couldn't delete the account", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-50/60 p-3 ring-1 ring-zinc-200/80 dark:bg-zinc-950/40 dark:ring-zinc-800">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold uppercase text-accent">
        {account.name.trim().charAt(0) || '?'}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename();
              if (e.key === 'Escape') {
                setName(account.name);
                setEditing(false);
              }
            }}
            className="w-full rounded-md bg-white px-1.5 py-0.5 text-sm font-medium outline-none ring-2 ring-accent/40 dark:bg-zinc-900"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="truncate text-sm font-medium hover:underline">
            {account.name}
          </button>
        )}
        <p className="mt-0.5 text-xs text-zinc-500">
          {account.isOwner
            ? 'Owner · password is APP_PASSWORD in .env'
            : account.mustChangePassword
              ? 'Waiting for them to create their own password'
              : account.lastLoginAt
                ? `Last signed in ${shortDate(account.lastLoginAt)}`
                : "Hasn't signed in yet"}
        </p>
      </div>
      {!account.isOwner && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={resetPassword}
            disabled={busy}
            title="Reset password"
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <KeyRound className="size-4" />
          </button>
          <button
            onClick={remove}
            disabled={busy}
            title="Delete account"
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordSection({ isOwner }: { isOwner: boolean }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  if (isOwner) {
    return (
      <Section icon={<KeyRound className="size-[18px]" />} title="Your password" description="The owner's password is APP_PASSWORD in the server's .env file.">
        <p className="text-sm text-zinc-500">Change it there and restart the container to update it.</p>
      </Section>
    );
  }

  const longEnough = password.length >= 10;
  const matches = password.length > 0 && password === confirm;
  const canSave = longEnough && matches && current.length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/account/password', { method: 'POST', json: { current, password } });
      setCurrent('');
      setPassword('');
      setConfirm('');
      setState('saved');
      toast.success('Password changed');
      setTimeout(() => setState('idle'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={<KeyRound className="size-[18px]" />} title="Your password" description="Change the password you sign in with.">
      <div className="max-w-sm space-y-2.5">
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (at least 10 characters)"
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          className={cn(inputClass, confirm.length > 0 && !matches && 'ring-red-300 focus:ring-red-400/60 dark:ring-red-900')}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3">
        <SaveButton state={state} disabled={!canSave} onClick={save} label="Change password" />
      </div>
    </Section>
  );
}

function StatusRow({ ok, name, detail }: { ok: boolean; name: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 bg-white px-4 py-3 dark:bg-transparent">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" />}
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="break-words text-sm text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}
