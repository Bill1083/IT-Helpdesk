import { NextResponse } from 'next/server';

import { backupConfigured, backupStatus, runBackup } from '@/lib/backup';
import { jsonError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(backupStatus());
}

/** "Back up now" from Settings; waits for the backup and returns the new status. */
export async function POST() {
  if (!backupConfigured()) return jsonError('R2 is not configured. Add the R2_* values to .env and restart.');
  return NextResponse.json(await runBackup());
}
