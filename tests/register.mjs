import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))) {
      const base = specifier.startsWith('@/')
        ? resolve(sourceRoot, specifier.slice(2))
        : resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      const candidates = extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}.mjs`];
      const found = candidates.find(existsSync);
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url)) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(source, {
          fileName: fileURLToPath(url),
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true },
        }).outputText,
      };
    }
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, {get: (_, name) => String(name)})' };
    return nextLoad(url, context);
  },
});
