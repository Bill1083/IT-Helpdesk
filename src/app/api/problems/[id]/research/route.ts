import { NextResponse, type NextRequest } from 'next/server';

import { startResearch } from '@/lib/ai/engine';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { getOwnedProblem } from '@/lib/repo';
import { requireAccount } from '@/lib/session';
import type { Problem, ResearchSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function snapshot(problem: Problem): ResearchSnapshot {
  return {
    status: problem.researchStatus,
    headline: problem.researchHeadline,
    brief: problem.researchBrief,
    sources: problem.researchSources,
    queries: problem.researchQueries,
    updatedAt: problem.researchUpdatedAt,
    title: problem.title,
    categories: problem.categories,
    summary: problem.summary,
    mode: problem.mode,
  };
}

/** Polled by the problem page while research runs; also carries the classifier's title. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const problem = getOwnedProblem((await params).id, auth.account.id);
  return problem ? NextResponse.json(snapshot(problem)) : jsonError('Problem not found.', 404);
}

/** "Dig deeper": re-run research with everything tried so far. */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedProblem(id, auth.account.id)) return jsonError('Problem not found.', 404);
  if (!env.geminiApiKey) return jsonError('Add GEMINI_API_KEY to .env to run research.');
  startResearch(id);
  return NextResponse.json(snapshot(getOwnedProblem(id, auth.account.id)!));
}
