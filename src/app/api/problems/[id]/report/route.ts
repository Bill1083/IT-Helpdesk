import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { describeError } from '@/lib/ai/engine';
import { jsonError, readBody } from '@/lib/http';
import { buildReport } from '@/lib/report/build';
import { renderReport } from '@/lib/report/document';
import { getOwnedProblem, updateProblem } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';
// Writing the summary and laying out the PDF can take a little while.
export const maxDuration = 120;

const schema = z.object({
  notes: z.string().max(8000).default(''),
  /** The browser's time zone, so dates match the admin's calendar. */
  timeZone: z.string().max(64).optional(),
});

function validTimeZone(zone: string | undefined): string {
  if (!zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

/** A file name that is safe on Windows and macOS. */
function fileName(reference: string, title: string): string {
  const safe = title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
  return `${reference} - ${safe || 'IT service report'}.pdf`;
}

/** Writes the service report for a chat and returns it as a PDF download. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedProblem(id, auth.account.id)) return jsonError('Problem not found.', 404);
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;

  const notes = body.data.notes.trim();
  // Kept for next time, without moving the chat up the sidebar.
  updateProblem(id, { reportNotes: notes || null }, false);

  try {
    const report = await buildReport(id, notes, validTimeZone(body.data.timeZone));
    if (!report) return jsonError('Problem not found.', 404);
    const pdf = await renderReport({ ...report, timeZone: validTimeZone(body.data.timeZone) });
    const name = fileName(report.meta.reference, report.content.title);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[it-desk] report export failed:', error);
    return jsonError(`Couldn't create the report. ${describeError(error)}`, 502);
  }
}
