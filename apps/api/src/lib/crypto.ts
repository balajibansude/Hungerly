import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time comparison of two hex/ascii strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext). */
export function encryptField(keyBase64: string, plaintext: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url')).join('.');
}

export function decryptField(keyBase64: string, payload: string): string {
  const [iv, tag, ciphertext] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted field');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Password hash for admin accounts: scrypt$N$r$p$salt$hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))),
  );
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, hashText] = stored.split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      Buffer.from(saltText, 'base64url'),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
  return timingSafeEqual(actual, expected);
}
