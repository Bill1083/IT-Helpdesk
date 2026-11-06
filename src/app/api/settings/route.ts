import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { aboutProfile, aiStatus } from '@/lib/ai/engine';
import { readBody } from '@/lib/http';
import { DEFAULT_ABOUT } from '@/lib/prompts';
import { DEFAULT_REPORT_NAME, reportName } from '@/lib/report/build';
import { setAccountSetting } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  return NextResponse.json({
    about: aboutProfile(auth.account.id),
    defaultAbout: DEFAULT_ABOUT,
    reportName: reportName(auth.account.id),
    ai: aiStatus(),
  });
}

const schema = z.object({
  about: z.string().max(8000).optional(),
  /** The business name printed on service reports. */
  reportName: z.string().max(80).optional(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const { about, reportName: name } = body.data;
  if (about !== undefined) setAccountSetting(auth.account.id, 'about', about.trim() || DEFAULT_ABOUT);
  if (name !== undefined) setAccountSetting(auth.account.id, 'report_name', name.trim() || DEFAULT_REPORT_NAME);
  return NextResponse.json({ about: aboutProfile(auth.account.id), reportName: reportName(auth.account.id) });
}
