import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourceRoot = path.resolve('src');
const componentImport = "import { LocalizedText } from '@/views/components/common/LocalizedText';\n";

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && target.endsWith('.tsx') ? [target] : [];
  });
}

for (const file of sourceFiles(sourceRoot)) {
  if (file.endsWith(`${path.sep}LocalizedText.tsx`)) continue;
  let source = fs.readFileSync(file, 'utf8');
  let parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attributeRepairs = [];
  const findWrappedAttributes = (node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxElement(node.initializer) &&
      node.initializer.openingElement.tagName.getText(parsed) === 'LocalizedText'
    ) {
      const expression = node.initializer.children.find(
        (child) => ts.isJsxExpression(child) && child.expression,
      );
      if (expression?.expression) {
        attributeRepairs.push({
          start: node.initializer.getStart(parsed),
          end: node.initializer.getEnd(),
          text: `{${expression.expression.getText(parsed)}}`,
        });
      }
    }
    ts.forEachChild(node, findWrappedAttributes);
  };
  findWrappedAttributes(parsed);
  for (const repair of attributeRepairs.sort((left, right) => right.start - left.start)) {
    source = `${source.slice(0, repair.start)}${repair.text}${source.slice(repair.end)}`;
  }
  if (attributeRepairs.length > 0) {
    parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  }
  const replacements = [];

  const stringResult = (expression) => {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return /[A-Za-z]/.test(expression.text);
    }
    if (ts.isTemplateExpression(expression)) return /[A-Za-z]/.test(expression.getText(parsed));
    if (ts.isParenthesizedExpression(expression)) return stringResult(expression.expression);
    if (ts.isConditionalExpression(expression)) {
      return stringResult(expression.whenTrue) || stringResult(expression.whenFalse);
    }
    if (ts.isBinaryExpression(expression)) {
      const supported = [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
      ].includes(expression.operatorToken.kind);
      return supported && (stringResult(expression.left) || stringResult(expression.right));
    }
    return false;
  };

  function visit(node) {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) {
      const parentTag = ts.isJsxElement(node.parent)
        ? node.parent.openingElement.tagName.getText(parsed)
        : '';
      if (!['code', 'pre', 'LocalizedText'].includes(parentTag)) {
        replacements.push({ start: node.getStart(parsed), end: node.getEnd(), text: `<LocalizedText>${node.getText(parsed)}</LocalizedText>` });
      }
    }
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      stringResult(node.expression)
    ) {
      const parentTag = ts.isJsxElement(node.parent)
        ? node.parent.openingElement.tagName.getText(parsed)
        : '';
      if (!['code', 'pre', 'LocalizedText'].includes(parentTag)) {
        replacements.push({
          start: node.getStart(parsed),
          end: node.getEnd(),
          text: `<LocalizedText>{${node.expression.getText(parsed)}}</LocalizedText>`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (replacements.length === 0 && attributeRepairs.length === 0) continue;

  let updated = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  if (!updated.includes("from '@/views/components/common/LocalizedText'")) {
    const reparsed = ts.createSourceFile(file, updated, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = reparsed.statements.filter(ts.isImportDeclaration);
    const insertAt = imports.length > 0 ? imports.at(-1).getEnd() + 1 : 0;
    updated = `${updated.slice(0, insertAt)}${componentImport}${updated.slice(insertAt)}`;
  }
  fs.writeFileSync(file, updated);
}
