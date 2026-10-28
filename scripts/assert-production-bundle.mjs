import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const assets = resolve('dist', 'assets');
const files = (await readdir(assets)).filter((file) => file.endsWith('.js'));
const forbidden = ['SparkDemo2026!', 'alex.stone@c-job.test', 'samuel.park@c-job.test'];
const lazyLocalizationMarkers = ['Робочий простір', 'Рабочее пространство'];
const violations = [];
const entryFiles = files.filter((file) => file.startsWith('index-'));
const localizedChunks = new Set();

for (const file of files) {
  const source = await readFile(resolve(assets, file), 'utf8');
  for (const marker of forbidden) if (source.includes(marker)) violations.push(`${file}: ${marker}`);
  for (const marker of lazyLocalizationMarkers) if (source.includes(marker)) localizedChunks.add(file);
}

for (const file of entryFiles) {
  const source = await readFile(resolve(assets, file), 'utf8');
  if (source.includes('recharts') || source.includes('victory-vendor'))
    violations.push(`${file}: charting dependency leaked into the initial entry`);
  for (const marker of lazyLocalizationMarkers) {
    if (source.includes(marker)) violations.push(`${file}: ${marker} leaked into the initial entry`);
  }
}

if (localizedChunks.size < 2)
  violations.push('Russian and Ukrainian dictionaries were not emitted as lazy chunks');

if (violations.length) {
  throw new Error(`Production bundle contains demo data:\n${violations.join('\n')}`);
}
process.stdout.write('Production bundle is free of demo identities; charts and localized dictionaries stay out of the initial entry.\n');
