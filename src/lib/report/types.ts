/**
 * The service report has a fixed structure. The AI only fills in these text
 * fields (with hard length limits); the layout, section order and headings
 * all live in code, so every export looks the same however much or little
 * happened in the chat.
 */

export type StepResult = 'worked' | 'failed' | 'partial' | 'checked';

export interface ReportContent {
  /** Short title for the work, e.g. "Word won't open OneDrive files". */
  title: string;
  /** The problem or goal, in one to three sentences. */
  objective: string;
  /** What was done and the result, in plain language a client can follow. */
  solution: string;
  /** Technical detail as labelled bullets, e.g. Diagnostics / Root cause / Resolution. */
  technical: { label: string; text: string }[];
  /** What was tried, in order, with how each attempt went. */
  attempts: { action: string; result: StepResult }[];
  /** The confirmed cause, or null when it was never pinned down. */
  rootCause: string | null;
  /** Things the client or admin should do next. Empty when nothing is needed. */
  followUp: string[];
}

/** Facts that come straight from the database, never from the AI. */
export interface ReportMeta {
  reference: string;
  preparedBy: string;
  client: string | null;
  reportedBy: string | null;
  /** Fix, How-to, Plan or Options. */
  type: string;
  /** Plain label for how the chat was closed, e.g. "Fixed" or "Workaround in place". */
  outcome: string;
  outcomeTone: 'good' | 'warn' | 'bad' | 'neutral';
  openedAt: number;
  closedAt: number | null;
  /** Commands from the chat, as saved to Useful commands. */
  commands: { command: string; title: string | null }[];
}
