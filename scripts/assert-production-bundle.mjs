import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const assets = resolve('dist', 'assets');
const files = (await readdir(assets)).filter((file) => file.endsWith('.js'));
const forbidden = ['SparkDemo2026!', 'alex.stone@c-job.test', 'samuel.park@c-job.test'];
const violations = [];
const entryFiles = files.filter((file) => file.startsWith('index-'));

for (const file of files) {
  const source = await readFile(resolve(assets, file), 'utf8');
  for (const marker of forbidden) if (source.includes(marker)) violations.push(`${file}: ${marker}`);
}

for (const file of entryFiles) {
  const source = await readFile(resolve(assets, file), 'utf8');
  if (source.includes('recharts') || source.includes('victory-vendor'))
    violations.push(`${file}: charting dependency leaked into the initial entry`);
}

if (violations.length) {
  throw new Error(`Production bundle contains demo data:\n${violations.join('\n')}`);
}
process.stdout.write('Production bundle contains no known demo credentials or identities.\n');
