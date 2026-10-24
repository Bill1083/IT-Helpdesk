import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonError, readBody } from '@/lib/http';
import { MODE_KEYS, guessMode } from '@/lib/modes';
import { routePlaybooks } from '@/lib/playbooks';
import { createProblem, getOwnedEnvironment, listProblems, setAccountSetting } from '@/lib/repo';
import { attachmentsSchema } from '@/lib/schemas';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const q = request.nextUrl.searchParams.get('q')?.trim() || undefined;
  return NextResponse.json({ problems: listProblems(auth.account.id, { q }) });
}

const createSchema = z.object({
  description: z.string().trim().min(3, 'describe the problem').max(20_000),
  reporter: z.string().trim().max(120).optional(),
  attachments: attachmentsSchema,
  environmentId: z.string().max(40).nullable().default(null),
  mode: z.enum(['auto', ...MODE_KEYS]).default('auto'),
});

/** Saves the request and returns at once; the first reply streams from /turn. */
export async function POST(request: NextRequest) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const accountId = auth.account.id;
  const body = await readBody(request, createSchema);
  if ('response' in body) return body.response;
  const { description, reporter, attachments, environmentId, mode } = body.data;
  if (environmentId && !getOwnedEnvironment(environmentId, accountId)) return jsonError('That environment no longer exists.');

  const { problem } = createProblem({
    accountId,
    description,
    reporter: reporter || null,
    attachments,
    environmentId,
    // Instant guesses so the first reply already has the right style and playbooks.
    mode: mode === 'auto' ? guessMode(description) : mode,
    modeLocked: mode !== 'auto',
    categories: routePlaybooks(description),
  });
  if (environmentId) setAccountSetting(accountId, 'last_environment', environmentId);
  return NextResponse.json({ problem }, { status: 201 });
}
