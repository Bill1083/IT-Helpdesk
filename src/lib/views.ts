import { liveTurn, similarFromMatches } from '@/lib/ai/engine';
import { getMessages, getProblem } from '@/lib/repo';
import type { Message, Problem, SimilarProblem } from '@/lib/types';

export interface ProblemView {
  problem: Problem;
  messages: Message[];
  similar: SimilarProblem[];
  /** A reply still being written on the server, so the page can rejoin it. */
  live: { text: string; status: string | null } | null;
}

export function problemView(id: string): ProblemView | null {
  const problem = getProblem(id);
  if (!problem) return null;
  return { problem, messages: getMessages(id), similar: similarFromMatches(problem.related), live: liveTurn(id) };
}
