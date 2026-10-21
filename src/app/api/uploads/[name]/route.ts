import fs from 'node:fs';
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { jsonError } from '@/lib/http';
import { uploadPath } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = uploadPath(name);
  if (!file || !fs.existsSync(file)) return jsonError('Not found.', 404);
  const ext = path.extname(name).slice(1);
  return new Response(fs.readFileSync(file), {
    headers: {
      // Text files are served as plain text so nothing in them can run.
      'Content-Type': TYPES[ext] ?? 'text/plain; charset=utf-8',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
