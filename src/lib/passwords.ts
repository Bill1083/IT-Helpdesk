/** Account passwords: generated, shown once, stored only as a scrypt hash. Node only. */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 32;
// No 0/o, 1/l/i: easy to read out or type from a message.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Four groups of four, e.g. "k7mq-x3tp-9wza-hf2c" (about 79 bits). */
export function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let group = '';
    for (let i = 0; i < 4; i += 1) group += ALPHABET[crypto.randomInt(ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
