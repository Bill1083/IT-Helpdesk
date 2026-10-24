import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { readBody } from '@/lib/http';
import { createEnvironment, listEnvironments } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ environments: listEnvironments(auth.account.id) });
}

const schema = z.object({
  name: z.string().trim().min(1, 'give it a name').max(80),
  profile: z.string().max(8000).default(''),
});

export async function POST(request: NextRequest) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const environment = createEnvironment(auth.account.id, body.data.name, body.data.profile.trim());
  return NextResponse.json({ environment }, { status: 201 });
}
