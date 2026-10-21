import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { describeError, streamTurn } from '@/lib/ai/engine';
import { jsonError, readBody } from '@/lib/http';
import { getProblem } from '@/lib/repo';
import { attachmentsSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const schema = z.object({
  kind: z.enum(['worked', 'failed', 'error', 'cant', 'note', 'clarify']).optional(),
  content: z.string().max(20_000).default(''),
  attachments: attachmentsSchema,
  regenerate: z.boolean().default(false),
  provider: z.enum(['gemini', 'claude']).default('gemini'),
  search: z.boolean().default(false),
});

/**
 * Streams the next step as NDJSON. With no `kind` and no `regenerate` it
 * produces the first step for a freshly created problem.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getProblem(id)) return jsonError('Problem not found.', 404);
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const { kind, content, attachments, regenerate, provider, search } = body.data;
  if ((kind === 'note' || kind === 'clarify') && !content.trim() && attachments.length === 0) {
    return jsonError('Write what happened first.');
  }

  const encoder = new TextEncoder();
  const events = streamTurn(id, {
    provider,
    search,
    regenerate,
    report: kind ? { kind, content, attachments } : undefined,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the browser goes away mid-step we keep generating, so the step is
      // saved and waiting when the problem is reopened.
      let open = true;
      const send = (event: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        for await (const event of events) send(event);
      } catch (error) {
        send({ type: 'error', message: describeError(error) });
      }
      if (open) {
        try {
          controller.close();
        } catch {
          // the client already closed it
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
