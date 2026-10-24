import { NextResponse } from 'next/server';

import { testConnection } from '@/lib/backup';
import { requireOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Step-by-step R2 check for Settings: settings, DNS, TLS, sign-in, write. */
export async function POST() {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ checks: await testConnection() });
}
