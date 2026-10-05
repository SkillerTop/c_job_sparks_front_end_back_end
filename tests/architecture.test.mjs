import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

const sourceFiles = (directory) => {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
};

const violationsFor = (directories, forbiddenImport) =>
  directories.flatMap((directory) =>
    sourceFiles(join(sourceRoot, directory)).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return forbiddenImport.test(source)
        ? [`${path.slice(sourceRoot.length)} imports a forbidden MVC layer`]
        : [];
    }),
  );

test('source folders follow the documented MVC dependency direction', () => {
  const violations = [
    ...violationsFor(['models'], /@\/(?:controllers|services|views|app)\//),
    ...violationsFor(['services'], /@\/(?:controllers|views|app)\//),
    ...violationsFor(['controllers'], /@\/views\//),
    ...violationsFor(['views'], /@\/(?:services|data)\//),
  ];

  assert.deepEqual(violations, []);
});
