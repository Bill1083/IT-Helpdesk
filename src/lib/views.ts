import { liveTurn, similarFromMatches } from '@/lib/ai/engine';
import { getMessages, getOwnedProblem } from '@/lib/repo';
import type { Message, Problem, SimilarProblem } from '@/lib/types';

export interface ProblemView {
  problem: Problem;
  messages: Message[];
  similar: SimilarProblem[];
  /** A reply still being written on the server, so the page can rejoin it. */
  live: { text: string; status: string | null } | null;
}

/** Everything the chat page needs, only if the chat belongs to this account. */
export function problemView(id: string, accountId: string): ProblemView | null {
  const problem = getOwnedProblem(id, accountId);
  if (!problem) return null;
  return { problem, messages: getMessages(id), similar: similarFromMatches(problem.related), live: liveTurn(id) };
}
