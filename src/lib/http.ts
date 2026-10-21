import { NextResponse } from 'next/server';
import type { z } from 'zod';

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Parse and validate a JSON body; returns the data or a ready-made 400 response. */
export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: jsonError('Expected a JSON body.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { response: jsonError(`${issue.path.join('.') || 'body'}: ${issue.message}`) };
  }
  return { data: parsed.data };
}
