import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src/views');
const hookImport = "import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';\n";

const files = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  return entry.isDirectory() ? files(target) : entry.isFile() && target.endsWith('.tsx') ? [target] : [];
});

for (const file of files(root)) {
  let source = fs.readFileSync(file, 'utf8');
  if (!/\bSHOP_TEXT\b/.test(source)) continue;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];
  const functions = new Set();
  let shopImport = null;

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@/constants/shop') shopImport = node;
    if (ts.isIdentifier(node) && node.text === 'SHOP_TEXT' && !ts.isImportSpecifier(node.parent)) {
      replacements.push({ start: node.getStart(parsed), end: node.getEnd(), text: 'shopText' });
      let parent = node.parent;
      while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
      if (parent?.body && ts.isBlock(parent.body)) functions.add(parent);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (replacements.length === 0) continue;

  if (shopImport?.importClause?.namedBindings && ts.isNamedImports(shopImport.importClause.namedBindings)) {
    const names = shopImport.importClause.namedBindings.elements
      .filter((item) => item.name.text !== 'SHOP_TEXT')
      .map((item) => item.getText(parsed));
    replacements.push({
      start: shopImport.getStart(parsed),
      end: shopImport.getEnd(),
      text: names.length ? `import { ${names.join(', ')} } from '@/constants/shop';` : '',
    });
  }
  for (const fn of functions) {
    replacements.push({
      start: fn.body.getStart(parsed) + 1,
      end: fn.body.getStart(parsed) + 1,
      text: '\n  const shopText = useLocalizedShopText();',
    });
  }
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    source = `${source.slice(0, replacement.start)}${replacement.text}${source.slice(replacement.end)}`;
  }
  if (!source.includes("from '@/hooks/useLocalizedShopText'")) {
    const reparsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = reparsed.statements.filter(ts.isImportDeclaration);
    const insertAt = imports.length ? imports.at(-1).getEnd() + 1 : 0;
    source = `${source.slice(0, insertAt)}${hookImport}${source.slice(insertAt)}`;
  }
  fs.writeFileSync(file, source);
}
