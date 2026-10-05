import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { Queryable } from './sql.js';
import { badRequest, notFound } from './errors.js';
import { one } from './sql.js';

const allowedTypes = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

export const storeImage = async (
  db: Queryable,
  mediaRoot: string,
  userId: string,
  fileName: string,
  contentType: string,
  contents: Buffer,
) => {
  const extension = allowedTypes.get(contentType);
  if (!extension) throw badRequest('INVALID_IMAGE_TYPE', 'Only PNG, JPEG, WebP and GIF images are supported.');
  const digest = createHash('sha256').update(contents).digest('hex');
  const storageKey = `${digest}${extension}`;
  await mkdir(mediaRoot, { recursive: true });
  const path = resolve(mediaRoot, storageKey);
  try {
    await writeFile(path, contents, { flag: 'wx' });
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const existing = await db.query(`SELECT id FROM app.media_assets WHERE storage_provider='local' AND storage_key=$1`, [storageKey]);
  const id = existing.rows[0]?.id as string | undefined ?? randomUUID();
  if (!existing.rows[0]) await db.query(`INSERT INTO app.media_assets
    (id,storage_provider,storage_key,original_file_name,content_type,byte_size,sha256,uploaded_by_user_id)
    VALUES ($1,'local',$2,$3,$4,$5,$6,$7)`, [id, storageKey, fileName, contentType, contents.length, digest, userId]);
  return { id, imageUrl: `/api/v1/media/${id}` };
};

export const loadImage = async (db: Queryable, mediaRoot: string, id: string) => {
  const asset = await one<{ storage_key: string; content_type: string }>(db, `SELECT storage_key,content_type
    FROM app.media_assets WHERE id=$1 AND storage_provider='local' AND status='Ready'`, [id]).catch(() => {
    throw notFound('Media asset');
  });
  if (extname(asset.storage_key) === '') throw notFound('Media asset');
  const root = resolve(mediaRoot);
  const path = resolve(root, asset.storage_key);
  if (!path.startsWith(`${root}${sep}`)) throw notFound('Media asset');
  return { contents: await readFile(path), contentType: asset.content_type };
};
