import { NextResponse } from 'next/server';

import { listCommands } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ commands: listCommands() });
}
