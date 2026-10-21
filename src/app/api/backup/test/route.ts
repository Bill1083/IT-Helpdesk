import { NextResponse } from 'next/server';

import { testConnection } from '@/lib/backup';

export const dynamic = 'force-dynamic';

/** Step-by-step R2 check for Settings: settings, DNS, TLS, sign-in, write. */
export async function POST() {
  return NextResponse.json({ checks: await testConnection() });
}
