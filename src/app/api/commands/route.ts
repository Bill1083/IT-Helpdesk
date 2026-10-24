import { NextResponse } from 'next/server';

import { listCommands } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ commands: listCommands(auth.account.id) });
}
