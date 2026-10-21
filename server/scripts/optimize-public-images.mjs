import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '../..');
const publicRoot = resolve(root, 'public');
const sourceRoot = resolve(root, 'docs', 'assets');

await mkdir(resolve(publicRoot, 'spark-icons'), { recursive: true });

for (const name of ['white', 'yellow', 'blue', 'radiant']) {
  await sharp(resolve(sourceRoot, 'spark-icons-source', `${name}.png`))
    .resize(96, 96, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86, effort: 5, alphaQuality: 90 })
    .toFile(resolve(publicRoot, 'spark-icons', `${name}.webp`));
}

await sharp(resolve(sourceRoot, 'og-brand-source.png'))
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 84, progressive: true, mozjpeg: true })
  .toFile(resolve(publicRoot, 'og-brand.jpg'));

process.stdout.write('Optimized public Spark icons and social preview.\n');
