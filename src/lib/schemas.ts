import fs from 'node:fs';

import { z } from 'zod';

import { uploadPath } from '@/lib/repo';

/** An attachment the browser got back from /api/uploads, checked against disk. */
export const attachmentSchema = z
  .object({
    name: z.string().max(60),
    original: z.string().max(200),
    mime: z.string().max(100),
    size: z.number().int().nonnegative(),
    kind: z.enum(['image', 'text']),
  })
  .refine((a) => {
    const file = uploadPath(a.name);
    return Boolean(file && fs.existsSync(file));
  }, 'attachment not found');

export const attachmentsSchema = z.array(attachmentSchema).max(8).default([]);
