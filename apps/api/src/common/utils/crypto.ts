import { createHash, randomBytes } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE62[bytes[i]! % 62];
  }
  return out;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
