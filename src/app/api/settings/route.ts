import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { aboutProfile, aiStatus } from '@/lib/ai/engine';
import { readBody } from '@/lib/http';
import { DEFAULT_ABOUT } from '@/lib/prompts';
import { setAccountSetting } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ about: aboutProfile(auth.account.id), defaultAbout: DEFAULT_ABOUT, ai: aiStatus() });
}

const schema = z.object({ about: z.string().max(8000) });

export async function PUT(request: NextRequest) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  setAccountSetting(auth.account.id, 'about', body.data.about.trim() || DEFAULT_ABOUT);
  return NextResponse.json({ about: aboutProfile(auth.account.id) });
}
