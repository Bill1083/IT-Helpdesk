import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { aboutProfile, aiStatus } from '@/lib/ai/engine';
import { readBody } from '@/lib/http';
import { DEFAULT_ABOUT } from '@/lib/prompts';
import { setSetting } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ about: aboutProfile(), defaultAbout: DEFAULT_ABOUT, ai: aiStatus() });
}

const schema = z.object({ about: z.string().max(8000) });

export async function PUT(request: NextRequest) {
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  setSetting('about', body.data.about.trim() || DEFAULT_ABOUT);
  return NextResponse.json({ about: aboutProfile() });
}
