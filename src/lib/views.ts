import { similarFromMatches } from '@/lib/ai/engine';
import { getMessages, getProblem } from '@/lib/repo';
import type { Message, Problem, SimilarProblem } from '@/lib/types';

export interface ProblemView {
  problem: Problem;
  messages: Message[];
  similar: SimilarProblem[];
}

export function problemView(id: string): ProblemView | null {
  const problem = getProblem(id);
  if (!problem) return null;
  return { problem, messages: getMessages(id), similar: similarFromMatches(problem.related) };
}
