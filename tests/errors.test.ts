import { describe, expect, it } from 'vitest';

import { resolveR2 } from '@/lib/backup';
import { explainError } from '@/lib/errors';

const ID = '0123456789abcdef0123456789abcdef';
const KEY = 'fedcba9876543210fedcba9876543210';
const SECRET = 'a'.repeat(64);

describe('error explanations', () => {
  it('explains the R2 handshake failure the user hit', () => {
    const raw =
      'write EPROTO 40EDF0679E760000:error:0A000410:SSL routines:ssl3_read_bytes:ssl/tls alert handshake failure:../deps/openssl/openssl/ssl/record/rec_layer_s3.c:918:SSL alert number 40';
    const help = explainError(raw, 'backup');
    expect(help.title).toBe("Couldn't open a secure connection to R2");
    expect(help.hint).toMatch(/R2_ACCOUNT_ID/);
    expect(help.code).toBe('EPROTO');
  });

  it('explains common AI and R2 failures and keeps the code', () => {
    expect(explainError('Gemini API error 429: RESOURCE_EXHAUSTED', 'ai')).toMatchObject({ title: 'Too many requests for now', code: '429' });
    expect(explainError('Claude API error 400: Your credit balance is too low', 'ai').title).toBe('The AI account is out of credit');
    expect(explainError('NoSuchBucket: The specified bucket does not exist', 'backup')).toMatchObject({ code: 'NoSuchBucket' });
    expect(explainError('SignatureDoesNotMatch', 'backup').title).toBe('R2 rejected the secret key');
    expect(explainError('TypeError: Failed to fetch').title).toBe("Can't reach IT Desk");
  });

  it('falls back to a generic hint with the raw code', () => {
    const help = explainError('ECONNWEIRD something odd');
    expect(help.title).toBe('Something went wrong');
    expect(help.code).toBe('ECONNWEIRD');
  });
});

describe('R2 settings', () => {
  const base = { accountId: ID, bucket: 'it-desk-backups', endpoint: undefined, accessKeyId: KEY, secretAccessKey: SECRET };

  it('builds the documented endpoint', () => {
    const { config, problems } = resolveR2(base);
    expect(problems).toEqual([]);
    expect(config).toMatchObject({ endpoint: `https://${ID}.r2.cloudflarestorage.com`, bucket: 'it-desk-backups' });
  });

  it('forgives a pasted endpoint URL and bucket URL', () => {
    const { config } = resolveR2({
      ...base,
      accountId: `https://${ID.toUpperCase()}.r2.cloudflarestorage.com`,
      bucket: `https://${ID}.r2.cloudflarestorage.com/it-desk-backups/`,
    });
    expect(config).toMatchObject({ accountId: ID, bucket: 'it-desk-backups' });
  });

  it('catches the account ID / access key mix-up and bad bucket names', () => {
    expect(resolveR2({ ...base, accountId: KEY }).problems.join(' ')).toMatch(/same as R2_ACCESS_KEY_ID/);
    expect(resolveR2({ ...base, accountId: 'my-account' }).problems.join(' ')).toMatch(/32-character Account ID/);
    expect(resolveR2({ ...base, bucket: 'IT Desk Backups' }).problems.join(' ')).toMatch(/just the bucket name/);
  });

  it('uses R2_ENDPOINT for jurisdiction buckets and warns on odd keys', () => {
    const { config, warnings } = resolveR2({ ...base, endpoint: `https://${ID}.eu.r2.cloudflarestorage.com/`, secretAccessKey: 'short' });
    expect(config?.host).toBe(`${ID}.eu.r2.cloudflarestorage.com`);
    expect(warnings.join(' ')).toMatch(/64 characters/);
  });
});
