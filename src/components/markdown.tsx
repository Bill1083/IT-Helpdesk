'use client';

import { AlertTriangle, Check, Copy } from 'lucide-react';
import { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { dangerLabel, heuristicDanger } from '@/lib/commands';

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children).replace(/\n$/, '');
  // Pattern check only, so it shows instantly; the library adds the AI rating.
  const risk = heuristicDanger(text);
  return (
    <div>
      {risk.level >= 4 && (
        <div className="not-prose mb-1 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {dangerLabel(risk.level)} risk: {risk.reasons[0]}. Read it before running.
        </div>
      )}
      <div className="group relative">
        <pre className="scroll-thin overflow-x-auto pr-10">{children}</pre>
        <button
          type="button"
          aria-label="Copy command"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-2 top-2 rounded-md bg-white/10 p-1.5 text-zinc-300 opacity-0 transition hover:bg-white/20 group-hover:opacity-100 focus:opacity-100"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
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
