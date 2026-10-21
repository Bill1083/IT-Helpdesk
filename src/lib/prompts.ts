import { DANGER_LEVELS } from '@/lib/commands';
import { modeLabel } from '@/lib/modes';
import { outcomeLabel } from '@/lib/outcomes';
import { PLAYBOOKS, playbooksFor } from '@/lib/playbooks';
import type { Environment, Mode, Problem, ReportKind, ResolutionKind, SimilarProblem } from '@/lib/types';

/** Stack of the first client; each environment gets its own copy to edit. */
export const DEFAULT_ENVIRONMENT = `- Identity & productivity: both Google Workspace and Microsoft 365 / Entra ID are in use - check which one a given app or account is tied to.
- Device management: Rippling MDM manages company laptops (macOS and Windows): enrolment, app installs, OS updates and security policies. Rippling is also the HR system.
- Communication: Slack.
- AI tools: Claude and ChatGPT.`;

export const DEFAULT_ABOUT = `I'm a contract IT administrator supporting several client organisations, with admin access to their consoles. Employees bring me problems and questions; I fix things myself or walk them through it. I also plan projects, evaluate tools and look up how things work.`;

const CORE = `You are the admin's IT partner. Employees bring the admin problems and questions, and the admin also plans projects and weighs up tools. Help them get it done fast.

Always:
- Be concrete: exact menu paths, admin-console locations, and commands in fenced code blocks tagged with the shell (powershell, cmd, zsh, bash). Say when admin rights or sudo are needed.
- One command or script per fenced block, and only things to run - never sample output in a code block.
- Warn in one line before anything destructive (wipe, delete, profile reset, reinstall that loses data).
- No filler, no disclaimers, no restating the request. Never invent menu paths, settings or features; if unsure of a product's current UI, say so in a few words and say how to find it.
- Answer for this client's environment (below). Past problems from other clients can still help: adapt their fixes.

Match the style to the request type given in the context.

FIX - something is broken:
- ONE step at a time; the admin does it and reports back. Lead with the most likely fix, never repeat a step already tried, and if a past problem matches, try its fix first and say so. At most one alternative line, never a menu of options.
- Under about 140 words plus commands. If you need information to decide (error code, OS version, which account), make collecting it part of the step and say exactly what to report back.
- Format:
  **Likely cause:** <one sentence>        <- first reply only
  ### Step <n> - <short action title, max 8 words>
  1. <instruction>
  **You should see:** <expected result, one line>
  **If not:** <one alternative, one line>        <- optional
- When the admin reports it worked: one or two sentences on what fixed it and suggest marking it resolved. When they could not do a step: a different route to the same check.
- When the admin asks a question or adds detail about the current step (the context says so), do not move on: answer in one to three sentences, then give the revised step with the same number.

HOW-TO - how to do something, or how something works:
- One-line answer first. For a task, then "### <Task name>" with the complete numbered procedure if it fits in about 8 steps (otherwise the first stage, and say what comes next), and an optional "**Good to know:**" line with one gotcha. For "how does X work", 3-6 short sentences or bullets.

PLAN - planning a rollout, migration or change:
- If the plan genuinely depends on unknowns, first ask up to 3 sharp questions, each with your default assumption. Otherwise: "**Goal:**" one line, "### Phases" (numbered, 2-4 key tasks each), "### Risks" (top 3, each with a mitigation), "### Decisions for you". Skimmable; offer to expand a phase.

OPTIONS - choosing between tools or approaches:
- "**Recommendation:**" first, with a one-sentence reason. Then a compact Markdown table of at most 3 options (cost, effort, fit for this client, main drawback). Then "**What would change my mind:**" in one line.

Follow-ups keep the same style unless the request type changes.`;

export function buildSystemPrompt(opts: { about: string; environment: Environment | null; categories: string[] }): string {
  const books = playbooksFor(opts.categories);
  const notes = books.length
    ? books.map((b) => `## ${b.label}\n${b.guidance}`).join('\n\n')
    : 'No specialist area matched yet. Work from the request.';
  const environment = opts.environment
    ? `# This client's environment: ${opts.environment.name}\n${opts.environment.profile.trim() || '(no details recorded yet)'}`
    : '# Client environment\nNone set for this request.';
  return `${CORE}

# About the admin
${opts.about.trim() || DEFAULT_ABOUT}

${environment}

# Specialist notes
${notes}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The opening user turn: the request itself plus matching past problems from any client. */
export function problemBlock(problem: Problem, similar: SimilarProblem[], environmentName: string | null): string {
  const lines = [
    '# Request',
    `Client: ${environmentName ?? 'not set'}`,
    `Reported by: ${problem.reporter || 'not recorded'}`,
    `Logged: ${formatDate(problem.createdAt)}`,
    '',
    problem.description,
  ];
  if (similar.length) {
    lines.push('', "# Similar past problems (the admin's own history, across all clients)");
    for (const s of similar) {
      const where = [formatDate(s.createdAt), s.environmentName && `client: ${s.environmentName}`, s.reporter && `reported by ${s.reporter}`]
        .filter(Boolean)
        .join(', ');
      const outcome = s.status === 'resolved' ? outcomeLabel(s.resolutionKind ?? 'fixed') : 'still open';
      lines.push(
        `- ${where} (${outcome}): ${s.summary || s.title || s.description.slice(0, 200)}` +
          (s.reason ? `\n  Why it matches: ${s.reason}` : '') +
          (s.resolution ? `\n  Outcome: ${s.resolution}` : '\n  Not resolved at the time.'),
      );
    }
  }
  return lines.join('\n');
}

const REPORT_LABEL: Record<ReportKind, string> = {
  start: '',
  worked: 'Result: it worked.',
  failed: "Result: didn't work.",
  error: 'Result: got a different error.',
  cant: "Result: couldn't do this step.",
  note: '',
  clarify: 'Question or extra detail about the current step:',
  closed: 'Closed.',
};

export function reportText(kind: string, content: string): string {
  const label = REPORT_LABEL[kind as ReportKind] ?? '';
  return [label, content.trim()].filter(Boolean).join('\n') || '(no details given)';
}

/** Volatile context appended to the latest user turn so the cached prefix stays stable. */
export function turnContext(opts: {
  mode: Mode;
  modeLocked: boolean;
  stepNumber: number;
  revising: boolean;
  researchBrief: string | null;
  researching: boolean;
}): string {
  const type = modeLabel(opts.mode).toUpperCase();
  const parts = [
    '---\nContext for your reply (added by the app, not the admin):',
    opts.modeLocked
      ? `- Request type: ${type} (chosen by the admin).`
      : `- Request type: ${type} (best guess - use another type if the request is clearly different).`,
  ];
  if (opts.mode === 'fix' && opts.revising) {
    parts.push(
      `- The admin's latest message is a question or extra detail about step ${opts.stepNumber}, not a result. Do not move on. Answer it briefly if it is a question, then give the revised step ${opts.stepNumber} (same number, with its ### heading) adjusted for what they said. If the step doesn't need to change, say so and restate it briefly.`,
    );
  } else if (opts.mode === 'fix') {
    parts.push(`- If you give a step, it is step ${opts.stepNumber}.`);
  }
  if (opts.researchBrief) {
    parts.push(`- Background research brief (web research on this request):\n${opts.researchBrief}`);
  } else if (opts.researching) {
    parts.push('- Background web research is still running; search the web yourself if the answer depends on current product behaviour.');
  }
  return parts.join('\n');
}

/* ----------------------------------------------------------- side tasks */

export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title, max 8 words, no person names.' },
    summary: {
      type: 'string',
      description: 'One or two sentence high-level description of the request, no person names.',
    },
    categories: {
      type: 'array',
      items: { type: 'string', enum: PLAYBOOKS.map((p) => p.key) },
      description: 'One or two areas that best fit, most relevant first.',
    },
    mode: {
      type: 'string',
      enum: ['fix', 'howto', 'plan', 'options'],
      description: 'fix = something is broken; howto = how to do something or how it works; plan = planning a change; options = choosing between tools or approaches.',
    },
  },
  required: ['title', 'summary', 'categories', 'mode'],
};

export function classifyPrompt(description: string): string {
  const areas = PLAYBOOKS.map((p) => `${p.key} = ${p.label}`).join('; ');
  return `Classify this request an IT admin received.\nAreas: ${areas}.\n\nRequest:\n${description.slice(0, 6000)}`;
}

export const RESOLUTION_SCHEMA = {
  type: 'object',
  properties: {
    resolution: {
      type: 'string',
      description:
        'One or two sentences on the outcome, concrete enough to reuse: what fixed it, the workaround, what was decided, or (if not fixed) what was ruled out.',
    },
    root_cause: {
      type: 'string',
      description: 'The underlying cause in one sentence, only if the transcript actually established it. Otherwise an empty string.',
    },
    summary: { type: 'string', description: 'One or two sentence high-level description of the request, no person names.' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      description: '2 to 5 short bullets (max 18 words each) recapping what was tried, learned or decided, in order.',
    },
  },
  required: ['resolution', 'root_cause', 'summary', 'highlights'],
};

const OUTCOME_BRIEF: Record<ResolutionKind, string> = {
  fixed: 'Fixed, and the admin believes the cause is known.',
  fixed_unknown: 'Fixed, but the cause was never found. Leave root_cause empty unless the transcript clearly proves it.',
  workaround: 'A workaround is in place; the underlying problem is not fixed.',
  unresolved: 'Closed without a fix. Say what was ruled out so the next attempt starts further on.',
  done: 'A how-to, plan or decision that is complete.',
};

export function resolutionPrompt(transcript: string, note: string, outcome: ResolutionKind): string {
  return `This IT request has just been closed. Recap it so it can be reused next time.

Outcome chosen by the admin: ${OUTCOME_BRIEF[outcome]}
Admin's closing note: ${note.trim() || '(none)'}

Transcript:
${transcript.slice(-12000)}`;
}

/* ------------------------------------------------ "seen before" relevance */

export const RELEVANCE_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          relevant: { type: 'boolean' },
          reason: { type: 'string', description: 'If relevant: why, in at most 15 words. Otherwise empty.' },
        },
        required: ['index', 'relevant', 'reason'],
      },
    },
  },
  required: ['matches'],
};

export function relevancePrompt(request: string, candidates: { index: number; text: string }[]): string {
  return `An IT admin got a new request. Decide which past problems from their history are genuinely the same issue or so closely related that the past outcome would directly help now.

Be strict: the same product or a similar symptom is not enough (two different Slack problems are not related). Mark relevant only if the root problem, symptoms and context clearly line up.

New request:
${request.slice(0, 3000)}

Past problems:
${candidates.map((c) => `[${c.index}] ${c.text}`).join('\n\n')}`;
}

export function userMessagePrompt(step: string, reporter: string | null): string {
  return `Rewrite this as a short, friendly Slack message from the IT admin to the employee${reporter ? ` (${reporter})` : ''}.
- Only include actions the employee does on their own computer. Leave out admin-console actions, or say "I'll check X on my side".
- Plain language, numbered steps, keep exact menu names and commands.
- Start with "Hi${reporter ? ` ${reporter.split(' ')[0]}` : ''}," and end by asking them to tell you what they see. Under 90 words. Output only the message.

Text:
${step}`;
}

/* ------------------------------------------------------------- commands */

export const COMMANDS_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          is_command: { type: 'boolean', description: 'False for sample output, config files or anything not meant to be run.' },
          platform: { type: 'string', enum: ['windows', 'mac', 'other'] },
          shell: { type: 'string', description: 'powershell, cmd, zsh, bash or terminal.' },
          title: { type: 'string', description: 'What it does in max 8 words, e.g. "Clear Slack desktop cache".' },
          what_it_does: { type: 'string', description: 'One or two plain sentences.' },
          when_to_use: { type: 'string', description: 'One sentence: the situations it is the right tool for.' },
          how_used: { type: 'string', description: 'One sentence: what it was used for in this conversation.' },
          danger: { type: 'integer', description: 'Danger rating 1-5.' },
          danger_notes: { type: 'string', description: 'What could go wrong and how to undo it. Empty for level 1.' },
          needs_admin: { type: 'boolean' },
        },
        required: ['index', 'is_command', 'platform', 'shell', 'title', 'what_it_does', 'when_to_use', 'how_used', 'danger', 'danger_notes', 'needs_admin'],
      },
    },
  },
  required: ['commands'],
};

export function commandsPrompt(context: { request: string; client: string | null; reply: string }, blocks: { index: number; lang: string; code: string }[]): string {
  const scale = DANGER_LEVELS.map((d) => `${d.level} = ${d.label}: ${d.hint}`).join('\n');
  return `An IT assistant gave these commands to an IT admin. Catalogue each code block for the admin's command library.

Danger scale:
${scale}
Rate by the worst realistic outcome if run as written, not by intent.

Request${context.client ? ` (client: ${context.client})` : ''}: ${context.request.slice(0, 1500)}

Assistant reply:
${context.reply.slice(0, 6000)}

Code blocks:
${blocks.map((b) => `[${b.index}] (${b.lang || 'untagged'})\n${b.code}`).join('\n\n')}`;
}

/* ------------------------------------------------------------- research */

export interface ResearchAngle {
  label: string;
  instruction: (sources: string[], today: string) => string;
}

const prefer = (sources: string[]) => (sources.length ? ` (prefer ${sources.join(', ')})` : '');

const ANGLES: Record<Mode, ResearchAngle[]> = {
  fix: [
    {
      label: 'Official docs & known issues',
      instruction: (s) =>
        `Search official vendor documentation, admin guides, release notes and status pages for this problem${prefer(s)}. Report confirmed causes, documented fixes with exact settings, menu paths or commands, and any known issue or outage.`,
    },
    {
      label: 'Fixes people confirmed',
      instruction: () =>
        'Search community sources (Reddit r/sysadmin, r/macsysadmin, r/Intune, vendor community forums, Stack Exchange, GitHub issues) for people who hit this exact problem. Report the fixes people confirmed worked, and the symptoms that tell the causes apart.',
    },
    {
      label: 'Recent changes',
      instruction: (_s, today) =>
        `Today is ${today}. Search for recent updates, version-specific bugs, outages or UI changes from roughly the last 90 days that relate to this problem. Report only relevant, dated findings, or say there are none.`,
    },
  ],
  howto: [
    {
      label: 'Official procedure',
      instruction: (s) =>
        `Find the current official procedure for this in vendor documentation${prefer(s)}. Report the exact steps, menu names, prerequisites and any licence requirements.`,
    },
    {
      label: 'Tips & gotchas',
      instruction: () =>
        'Search community sources (Reddit r/sysadmin, vendor forums, Stack Exchange) for practical tips, faster methods and common gotchas when doing this.',
    },
    {
      label: 'Recent changes',
      instruction: (_s, today) =>
        `Today is ${today}. Find recent UI changes, renamed settings or new methods for this from roughly the last 6 months, or say there are none.`,
    },
  ],
  plan: [
    {
      label: 'Vendor guidance',
      instruction: (s) =>
        `Find official deployment, migration or best-practice guides relevant to this plan${prefer(s)}: prerequisites, recommended phases, licensing and limits.`,
    },
    {
      label: 'Real-world experience',
      instruction: () =>
        'Search community write-ups (Reddit r/sysadmin, blogs, vendor forums) from admins who did this: pitfalls, realistic timelines, and what they would do differently.',
    },
    {
      label: 'Recent changes',
      instruction: (_s, today) =>
        `Today is ${today}. Find recent product changes, deprecations or pricing changes from roughly the last 6 months that affect this plan.`,
    },
  ],
  options: [
    {
      label: 'Official comparison',
      instruction: (s) =>
        `From official sources${prefer(s)}, report the features, pricing tiers and limits of the main options for this decision.`,
    },
    {
      label: 'What admins say',
      instruction: () =>
        'Search community comparisons and experiences (Reddit r/sysadmin, review sites, forums): strengths, weaknesses, and why admins switched between these options.',
    },
    {
      label: 'Recent changes',
      instruction: (_s, today) =>
        `Today is ${today}. Find recent pricing or feature changes, acquisitions or deprecations from roughly the last 6 months that affect these options.`,
    },
  ],
};

export function researchAngles(mode: Mode): ResearchAngle[] {
  return ANGLES[mode];
}

export function researchPrompt(angle: ResearchAngle, context: string, sources: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${angle.instruction(sources, today)}

Answer in concise bullet points, under 200 words, with exact steps where you have them. No preamble.

${context}`;
}

export const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description: 'The single most useful finding in under 25 words.',
    },
    brief: {
      type: 'string',
      description: 'Markdown, under 250 words, tailored to the request type.',
    },
  },
  required: ['headline', 'brief'],
};

const BRIEF_SHAPE: Record<Mode, string> = {
  fix: 'likely causes ranked, the recommended fix path in order, gotchas, and any known issue or outage with dates',
  howto: 'the current procedure, prerequisites, and gotchas',
  plan: 'the recommended approach, phases, key risks and prerequisites',
  options: 'a short comparison of the main options and which fits best, with the deciding factors',
};

export function synthesisPrompt(mode: Mode, context: string, findings: { label: string; text: string }[]): string {
  return `You are briefing an IT admin mid-way through a ${modeLabel(mode).toLowerCase()} request. Merge these research findings into one brief covering ${BRIEF_SHAPE[mode]}. Prefer what is documented or confirmed by several people; drop anything irrelevant or already tried.

${context}

${findings.map((f) => `## ${f.label}\n${f.text}`).join('\n\n')}`;
}
