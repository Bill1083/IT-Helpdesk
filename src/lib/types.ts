export type ProblemStatus = 'open' | 'resolved';
export type ResearchStatus = 'idle' | 'running' | 'ready' | 'failed';

/** What kind of request a conversation is: it decides the answer style. */
export type Mode = 'fix' | 'howto' | 'plan' | 'options';

/** What the user said happened when they report back on a step. */
export type ReportKind = 'start' | 'worked' | 'failed' | 'error' | 'cant' | 'note';

export type Provider = 'gemini' | 'claude';

export interface Attachment {
  /** Stored file name under data/uploads. */
  name: string;
  /** Name the file had when it was pasted or dropped. */
  original: string;
  mime: string;
  size: number;
  kind: 'image' | 'text';
}

export interface Source {
  title: string;
  url: string;
}

export interface RelatedMatch {
  id: string;
  score: number;
}

/** A client the admin contracts for, with its own stack description. */
export interface Environment {
  id: string;
  name: string;
  profile: string;
  createdAt: number;
  updatedAt: number;
}

export interface EnvironmentSummary extends Environment {
  problemCount: number;
}

export interface Problem {
  id: string;
  title: string | null;
  description: string;
  reporter: string | null;
  environmentId: string | null;
  mode: Mode;
  /** True when the admin picked the mode, so the classifier leaves it alone. */
  modeLocked: boolean;
  categories: string[];
  status: ProblemStatus;
  summary: string | null;
  resolution: string | null;
  researchStatus: ResearchStatus;
  researchHeadline: string | null;
  researchBrief: string | null;
  researchSources: Source[];
  researchQueries: string[];
  researchUpdatedAt: number | null;
  related: RelatedMatch[];
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface Message {
  id: number;
  problemId: string;
  role: 'user' | 'assistant';
  kind: string;
  content: string;
  attachments: Attachment[];
  provider: Provider | null;
  model: string | null;
  sources: Source[];
  createdAt: number;
}

export interface ProblemListItem {
  id: string;
  title: string | null;
  description: string;
  reporter: string | null;
  environmentId: string | null;
  mode: Mode;
  status: ProblemStatus;
  createdAt: number;
  updatedAt: number;
}

/** A past problem surfaced as "this sounds like…", possibly from another client. */
export interface SimilarProblem {
  id: string;
  title: string | null;
  summary: string | null;
  description: string;
  resolution: string | null;
  reporter: string | null;
  environmentName: string | null;
  status: ProblemStatus;
  createdAt: number;
  score: number;
}

export type CommandPlatform = 'windows' | 'mac' | 'other';

export interface CommandUse {
  id: number;
  problemId: string | null;
  problemTitle: string | null;
  environmentName: string | null;
  context: string | null;
  createdAt: number;
}

/** A command the AI suggested, saved to the Useful commands library. */
export interface SavedCommand {
  id: number;
  command: string;
  platform: CommandPlatform;
  shell: string | null;
  title: string | null;
  description: string | null;
  whenToUse: string | null;
  /** 1 safe (read-only) to 5 critical (can destroy data). */
  danger: number;
  dangerNotes: string | null;
  needsAdmin: boolean;
  createdAt: number;
  lastUsedAt: number;
  uses: CommandUse[];
}

/** What the problem page polls while background research runs. */
export interface ResearchSnapshot {
  status: ResearchStatus;
  headline: string | null;
  brief: string | null;
  sources: Source[];
  queries: string[];
  updatedAt: number | null;
  title: string | null;
  categories: string[];
  summary: string | null;
  mode: Mode;
}

/** One line of the NDJSON stream a step request returns. */
export type StreamEvent =
  | { type: 'status'; text: string }
  | { type: 'similar'; items: SimilarProblem[] }
  | { type: 'meta'; title: string | null; categories: string[]; summary: string | null; mode: Mode }
  | { type: 'delta'; text: string }
  | { type: 'sources'; items: Source[] }
  | { type: 'research'; status: ResearchStatus }
  | { type: 'done'; message: Message }
  | { type: 'error'; message: string };
