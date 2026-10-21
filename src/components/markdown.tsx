'use client';

import {
  AlertTriangle,
  Check,
  CircleHelp,
  Copy,
  CornerDownRight,
  Eye,
  Info,
  Lightbulb,
  Shuffle,
  Target,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import { isValidElement, memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/client';
import { dangerLabel, heuristicDanger } from '@/lib/commands';

/* ------------------------------------------------------------ code blocks */

const SHELL_LABELS: Record<string, string> = {
  powershell: 'PowerShell',
  ps: 'PowerShell',
  ps1: 'PowerShell',
  pwsh: 'PowerShell',
  cmd: 'Command Prompt',
  bat: 'Command Prompt',
  batch: 'Command Prompt',
  zsh: 'Terminal · zsh',
  bash: 'Terminal · bash',
  sh: 'Terminal',
  shell: 'Terminal',
  applescript: 'AppleScript',
};

export function shellLabel(lang: string | null | undefined): string {
  return (lang && SHELL_LABELS[lang.toLowerCase()]) || (lang ? lang : 'Command');
}

/** A command with a header bar (shell, risk, copy). Used in answers and the commands library. */
export function CodeBlock({ code, lang, showRisk = true }: { code: string; lang?: string | null; showRisk?: boolean }) {
  const [copied, setCopied] = useState(false);
  // Pattern check only, so it shows instantly; the library adds the AI rating.
  const risk = showRisk ? heuristicDanger(code) : null;
  return (
    <div className="not-prose my-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm dark:border-zinc-800">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-1.5">
        <span className="text-[11.5px] font-medium text-zinc-400">{shellLabel(lang)}</span>
        {risk && risk.level >= 3 && (
          <span
            title={risk.reasons.join('. ')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold',
              risk.level >= 4 ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300',
            )}
          >
            <AlertTriangle className="size-3" /> {dangerLabel(risk.level)} risk
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Copy command"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {risk && risk.level >= 4 && (
        <p className="border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200">
          {risk.reasons[0]}. Read it before running.
        </p>
      )}
      <pre className="scroll-thin overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function codeFromPre(children: React.ReactNode): { code: string; lang: string | null } {
  const child = Array.isArray(children) ? children[0] : children;
  if (isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
    const lang = child.props.className?.match(/language-([\w+#.-]+)/)?.[1] ?? null;
    return { code: extractText(child.props.children).replace(/\n$/, ''), lang };
  }
  return { code: extractText(children).replace(/\n$/, ''), lang: null };
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: React.ReactNode }>(node)) return extractText(node.props.children);
  return '';
}

/* --------------------------------------------------------------- callouts */

interface CalloutStyle {
  icon: LucideIcon;
  className: string;
  iconClass: string;
}

const tone = {
  accent: { className: 'bg-accent/[0.07] ring-accent/15', iconClass: 'text-accent' },
  green: { className: 'bg-emerald-500/[0.07] ring-emerald-500/20', iconClass: 'text-emerald-600 dark:text-emerald-400' },
  amber: { className: 'bg-amber-500/[0.08] ring-amber-500/20', iconClass: 'text-amber-600 dark:text-amber-400' },
  muted: { className: 'bg-zinc-500/[0.06] ring-zinc-500/15', iconClass: 'text-zinc-500 dark:text-zinc-400' },
};

/** Labels the prompts ask for become coloured callouts, so each step scans at a glance. */
const CALLOUTS: Record<string, CalloutStyle> = {
  'likely cause': { icon: Lightbulb, ...tone.accent },
  'you should see': { icon: Eye, ...tone.green },
  'if not': { icon: CornerDownRight, ...tone.muted },
  'good to know': { icon: Info, ...tone.amber },
  recommendation: { icon: ThumbsUp, ...tone.accent },
  goal: { icon: Target, ...tone.accent },
  'what would change my mind': { icon: Shuffle, ...tone.muted },
  'report back': { icon: CircleHelp, ...tone.muted },
};

function calloutFor(children: React.ReactNode): CalloutStyle | null {
  const first = Array.isArray(children) ? children[0] : children;
  if (!isValidElement<{ children?: React.ReactNode }>(first) || first.type !== 'strong') return null;
  const label = extractText(first.props.children).trim().replace(/:$/, '').toLowerCase();
  return CALLOUTS[label] ?? null;
}

/* ---------------------------------------------------------------- render */

const components: Components = {
  pre: ({ children }) => {
    const { code, lang } = codeFromPre(children);
    return <CodeBlock code={code} lang={lang} />;
  },
  p: ({ children }) => {
    const callout = calloutFor(children);
    if (!callout) return <p>{children}</p>;
    const Icon = callout.icon;
    return (
      <div className={cn('not-prose my-3 flex gap-2.5 rounded-xl px-3.5 py-2.5 text-[14.5px] leading-6 ring-1 ring-inset', callout.className)}>
        <Icon className={cn('mt-[3px] size-4 shrink-0', callout.iconClass)} />
        <p className="min-w-0 text-zinc-700 dark:text-zinc-300 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.88em] dark:[&_code]:bg-white/10 [&_strong]:font-semibold [&_strong]:text-zinc-900 dark:[&_strong]:text-zinc-50">
          {children}
        </p>
      </div>
    );
  },
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="not-prose my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-left text-[13.5px] [&_td]:border-t [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top dark:[&_td]:border-zinc-800 [&_th]:bg-zinc-50 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold dark:[&_th]:bg-zinc-900">
        {children}
      </table>
    </div>
  ),
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="step-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
