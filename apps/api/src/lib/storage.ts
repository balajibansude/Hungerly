import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * File storage boundary. Documents go to a private area that is never served directly;
 * menu images go to a media area served publicly by key. The local-disk driver is for
 * development and single-instance deployments; production should use the S3 driver
 * (private bucket + presigned GETs, docs/SECURITY.md) behind this same interface.
 */
export interface Storage {
  put(area: 'private' | 'media', key: string, data: Buffer): Promise<void>;
  read(area: 'private' | 'media', key: string): Promise<Readable | null>;
}

export function createLocalStorage(rootDir: string): Storage {
  const root = resolve(rootDir);
  const pathFor = (area: string, key: string) => {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error('Invalid storage key');
    const full = resolve(join(root, area, key));
    if (!full.startsWith(root + sep)) throw new Error('Invalid storage key');
    return full;
  };
  return {
    async put(area, key, data) {
      const full = pathFor(area, key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data, { mode: 0o600 });
    },
    async read(area, key) {
      const full = pathFor(area, key);
      try {
        await stat(full);
      } catch {
        return null;
      }
      return createReadStream(full);
    },
  };
}

/** In-memory storage for tests. */
export function createMemoryStorage(): Storage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(area, key, data) {
      files.set(`${area}/${key}`, data);
    },
    async read(area, key) {
      const data = files.get(`${area}/${key}`);
      if (!data) return null;
      const { Readable } = await import('node:stream');
      return Readable.from(data);
    },
  };
}

/** Detects the real file type from magic bytes; never trust the client's content-type. */
export function sniffMime(data: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
