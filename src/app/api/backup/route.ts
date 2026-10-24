import { NextResponse } from 'next/server';

import { backupConfigured, backupStatus, runBackup } from '@/lib/backup';
import { jsonError } from '@/lib/http';
import { requireOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  return NextResponse.json(backupStatus());
}

/** "Back up now" from Settings; waits for the backup and returns the new status. */
export async function POST() {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  if (!backupConfigured()) return jsonError('R2 is not configured. Add the R2_* values to .env and restart.');
  return NextResponse.json(await runBackup());
}
