import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { NextResponse, type NextRequest } from 'next/server';

import { uploadsDir } from '@/lib/db';
import { jsonError } from '@/lib/http';
import type { Attachment } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Image types both Gemini and Claude accept. */
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const TEXT_EXTENSIONS = new Set(['txt', 'log', 'json', 'csv', 'xml', 'md', 'yaml', 'yml', 'ini', 'conf', 'cfg', 'plist', 'ps1', 'sh', 'reg', 'html']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Expected a file upload.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return jsonError('Expected a file upload.');

  const extension = path.extname(file.name).slice(1).toLowerCase();
  const imageExt = IMAGE_TYPES[file.type];
  let kind: Attachment['kind'];
  let ext: string;
  if (imageExt) {
    if (file.size > MAX_IMAGE_BYTES) return jsonError('Images must be under 10 MB.');
    kind = 'image';
    ext = imageExt;
  } else if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/')) {
    if (file.size > MAX_TEXT_BYTES) return jsonError('Text files must be under 512 KB. Paste the relevant part instead.');
    kind = 'text';
    ext = TEXT_EXTENSIONS.has(extension) ? extension : 'txt';
  } else {
    return jsonError('Only screenshots (PNG, JPG, WebP, GIF) and text/log files are supported.');
  }

  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.mkdirSync(uploadsDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadsDir(), name), Buffer.from(await file.arrayBuffer()));

  const attachment: Attachment = {
    name,
    original: file.name.slice(0, 200) || `pasted.${ext}`,
    mime: kind === 'image' ? file.type : 'text/plain',
    size: file.size,
    kind,
  };
  return NextResponse.json({ attachment }, { status: 201 });
}
