import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import sharp from 'sharp';
import type { Queryable } from './sql.js';
import { badRequest, notFound } from './errors.js';
import { one } from './sql.js';

const allowedTypes = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

const optimizeImage = async (declaredType: string, contents: Buffer) => {
  const declaredFormat = allowedTypes.get(declaredType);
  if (!declaredFormat)
    throw badRequest('INVALID_IMAGE_TYPE', 'Only PNG, JPEG, WebP and GIF images are supported.');
  const image = sharp(contents, { failOn: 'warning', limitInputPixels: 40_000_000, pages: 1 });
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw badRequest('INVALID_IMAGE_CONTENT', 'The uploaded file is not a valid supported image.');
  }
  if (metadata.format !== declaredFormat)
    throw badRequest('IMAGE_TYPE_MISMATCH', 'The file contents do not match the declared image type.');
  try {
    return await image
      .rotate()
      .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch {
    throw badRequest('IMAGE_PROCESSING_FAILED', 'The image could not be safely processed.');
  }
};

export const storeImage = async (
  db: Queryable,
  mediaRoot: string,
  userId: string,
  fileName: string,
  contentType: string,
  contents: Buffer,
) => {
  const optimized = await optimizeImage(contentType, contents);
  const digest = createHash('sha256').update(optimized).digest('hex');
  const storageKey = `${digest}.webp`;
  await mkdir(mediaRoot, { recursive: true });
  const path = resolve(mediaRoot, storageKey);
  try {
    await writeFile(path, optimized, { flag: 'wx' });
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const existing = await db.query(`SELECT id FROM app.media_assets WHERE storage_provider='local' AND storage_key=$1`, [storageKey]);
  const id = existing.rows[0]?.id as string | undefined ?? randomUUID();
  if (!existing.rows[0]) await db.query(`INSERT INTO app.media_assets
    (id,storage_provider,storage_key,original_file_name,content_type,byte_size,sha256,uploaded_by_user_id)
    VALUES ($1,'local',$2,$3,$4,$5,$6,$7)`, [id, storageKey, fileName, 'image/webp', optimized.length, digest, userId]);
  return { id, imageUrl: `/api/v1/media/${id}` };
};

export const loadImage = async (db: Queryable, mediaRoot: string, id: string, width?: number) => {
  const asset = await one<{ storage_key: string; content_type: string }>(db, `SELECT storage_key,content_type
    FROM app.media_assets WHERE id=$1 AND storage_provider='local' AND status='Ready'`, [id]).catch(() => {
    throw notFound('Media asset');
  });
  if (extname(asset.storage_key) === '') throw notFound('Media asset');
  const root = resolve(mediaRoot);
  const path = resolve(root, asset.storage_key);
  if (!path.startsWith(`${root}${sep}`)) throw notFound('Media asset');
  const contents = await readFile(path);
  if (!width) return { contents, contentType: asset.content_type };
  const resized = await sharp(contents, { failOn: 'warning', limitInputPixels: 40_000_000, pages: 1 })
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: width <= 320 ? 78 : 82, effort: 4 })
    .toBuffer();
  return { contents: resized, contentType: 'image/webp' };
};
