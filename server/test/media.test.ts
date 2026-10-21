import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { ApiError } from '../src/errors.js';
import { loadImage, storeImage } from '../src/media.js';
import type { Queryable } from '../src/sql.js';

test('product media is content-sniffed, resized and stored as metadata-free WebP', async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), 'sparks-media-'));
  const inserted: unknown[][] = [];
  let storedStorageKey = '';
  const db = {
    async query(sql: string, values?: unknown[]) {
      if (sql.startsWith('SELECT storage_key'))
        return { rows: [{ storage_key: storedStorageKey, content_type: 'image/webp' }], rowCount: 1 };
      if (sql.startsWith('SELECT id')) return { rows: [], rowCount: 0 };
      inserted.push(values ?? []);
      storedStorageKey = String(values?.[1] ?? '');
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Queryable;
  try {
    const source = await sharp({
      create: { width: 1_400, height: 1_100, channels: 4, background: '#102840' },
    }).png().toBuffer();
    const stored = await storeImage(
      db,
      mediaRoot,
      'aaaaaaaa-0001-4000-8000-000000000001',
      'reward.png',
      'image/png',
      source,
    );
    const storageKey = String(inserted[0]?.[1]);
    assert.match(storageKey, /^[a-f0-9]{64}\.webp$/);
    assert.match(stored.imageUrl, /^\/api\/v1\/media\//);
    const optimized = await sharp(await readFile(join(mediaRoot, storageKey))).metadata();
    assert.equal(optimized.format, 'webp');
    assert.ok((optimized.width ?? 0) <= 960);
    assert.ok((optimized.height ?? 0) <= 960);

    const responsive = await loadImage(db, mediaRoot, stored.id, 320);
    const responsiveMetadata = await sharp(responsive.contents).metadata();
    assert.equal(responsive.contentType, 'image/webp');
    assert.equal(responsiveMetadata.width, 320);
    assert.ok((responsiveMetadata.height ?? 0) <= 320);

    await assert.rejects(
      storeImage(db, mediaRoot, 'aaaaaaaa-0001-4000-8000-000000000001', 'fake.jpg', 'image/jpeg', source),
      (error: unknown) => error instanceof ApiError && error.code === 'IMAGE_TYPE_MISMATCH',
    );
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
});
