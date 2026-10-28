import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourceRoot = path.resolve('src');
const localizationFile = path.join(sourceRoot, 'services', 'contentLocalization.ts');
const awareComponents = new Map([
  ['PageHeader', new Set(['eyebrow', 'title', 'description'])],
  ['EmptyState', new Set(['title', 'description'])],
  ['Modal', new Set(['title', 'description'])],
]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && target.endsWith('.tsx') ? [target] : [];
  });
}

function codeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return codeFiles(target);
    return entry.isFile() && /\.tsx?$/.test(target) ? [target] : [];
  });
}

function dictionaryKeys(names) {
  const source = fs.readFileSync(localizationFile, 'utf8');
  const parsed = ts.createSourceFile(localizationFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const keys = new Set();
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !names.has(declaration.name.text) || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = property.name;
        if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) keys.add(name.text.trim());
      }
    }
  }
  return keys;
}

const phrases = new Map();
for (const file of sourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const record = (value, node) => {
    const phrase = value
      .replaceAll('&amp;', '&')
      .replaceAll('&nbsp;', '\u00a0')
      .replaceAll('&apos;', "'")
      .trim()
      .replace(/\s+/g, ' ');
    if (!phrase || !/[A-Za-z]/.test(phrase)) return;
    if (!phrases.has(phrase)) phrases.set(phrase, []);
    phrases.get(phrase).push(`${path.relative(process.cwd(), file)}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}`);
  };
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(parsed) === 'LocalizedText') {
      const text = node.children.filter(ts.isJsxText).map((child) => child.text).join(' ');
      record(text, node);
      const collectOutcomes = (expression) => {
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
          record(expression.text, expression);
          return;
        }
        if (ts.isParenthesizedExpression(expression)) return collectOutcomes(expression.expression);
        if (ts.isConditionalExpression(expression)) {
          collectOutcomes(expression.whenTrue);
          collectOutcomes(expression.whenFalse);
          return;
        }
        if (ts.isBinaryExpression(expression)) {
          if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            collectOutcomes(expression.right);
          } else if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind)) {
            collectOutcomes(expression.left);
            collectOutcomes(expression.right);
          }
        }
      };
      for (const child of node.children) {
        if (ts.isJsxExpression(child) && child.expression) collectOutcomes(child.expression);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = awareComponents.get(node.tagName.getText(parsed));
      if (attributes) {
        for (const attribute of node.attributes.properties) {
          if (ts.isJsxAttribute(attribute) && attributes.has(attribute.name.getText(parsed)) && attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
            record(attribute.initializer.text, attribute);
          }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'localize') {
      const [argument] = node.arguments;
      if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) record(argument.text, argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}

const shopConstantsFile = path.join(sourceRoot, 'constants', 'shop.ts');
const shopSource = fs.readFileSync(shopConstantsFile, 'utf8');
const shopParsed = ts.createSourceFile(shopConstantsFile, shopSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const shopCollections = new Set(['SHOP_TEXT', 'PRODUCT_TYPE_OPTIONS', 'FULFILLMENT_KIND_OPTIONS', 'PRODUCT_ICON_OPTIONS', 'SHOP_CATEGORIES', 'SHOP_SORTS', 'RARITY_LABELS']);
const recordShop = (value, node) => {
  const phrase = value.trim().replace(/\s+/g, ' ');
  if (!phrase || !/[A-Za-z]/.test(phrase)) return;
  if (!phrases.has(phrase)) phrases.set(phrase, []);
  phrases.get(phrase).push(`${path.relative(process.cwd(), shopConstantsFile)}:${shopParsed.getLineAndCharacterOfPosition(node.getStart(shopParsed)).line + 1}`);
};
const collectShopStrings = (node, labelsOnly = false) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    recordShop(node.text, node);
    return;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const propertyName = property.name.getText(shopParsed).replace(/^['"]|['"]$/g, '');
      if (!labelsOnly || propertyName === 'label') collectShopStrings(property.initializer, labelsOnly);
    }
    return;
  }
  if (ts.isArrayLiteralExpression(node)) for (const item of node.elements) collectShopStrings(item, labelsOnly);
};
for (const statement of shopParsed.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !shopCollections.has(declaration.name.text) || !declaration.initializer) continue;
    collectShopStrings(declaration.initializer, declaration.name.text !== 'SHOP_TEXT' && declaration.name.text !== 'RARITY_LABELS');
  }
}

const categoryCatalogFile = path.resolve('server/migrations/0011_complete_spark_category_catalog.sql');
const categoryCatalog = fs.readFileSync(categoryCatalogFile, 'utf8');
for (const match of categoryCatalog.matchAll(/^\s*\('[^']+','[^']+','[^']+','[^']+','((?:[^']|'')*)','((?:[^']|'')*)',/gm)) {
  for (const value of [match[1], match[2]]) {
    const phrase = value.replaceAll("''", "'").trim();
    if (!phrase || !/[A-Za-z]/.test(phrase)) continue;
    if (!phrases.has(phrase)) phrases.set(phrase, []);
    phrases.get(phrase).push(`${path.relative(process.cwd(), categoryCatalogFile)}:${categoryCatalog.slice(0, match.index).split('\n').length}`);
  }
}

const publicErrorFactories = new Set([
  'Error', 'ApiError', 'badRequest', 'conflict', 'forbidden', 'notFound', 'unauthorized',
]);
for (const file of [...codeFiles(sourceRoot), ...codeFiles(path.resolve('server/src'))]) {
  const isServerFile = file.includes(`${path.sep}server${path.sep}src${path.sep}`);
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const recordError = (value, node) => {
    const phrase = value.trim().replace(/\s+/g, ' ');
    if (!phrase || !/[A-Za-z]/.test(phrase)) return;
    if (!phrases.has(phrase)) phrases.set(phrase, []);
    phrases.get(phrase).push(`${path.relative(process.cwd(), file)}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}`);
  };
  const visit = (node) => {
    const expression = ts.isCallExpression(node) || ts.isNewExpression(node) ? node.expression : null;
    const name = expression && (ts.isIdentifier(expression) ? expression.text : '');
    if (name && publicErrorFactories.has(name) && !(isServerFile && name === 'Error')) {
      for (const argument of node.arguments ?? []) {
        if (
          ts.isStringLiteral(argument) &&
          /[.!?]$/.test(argument.text.trim()) &&
          !/^use[A-Z].*Provider\.$/.test(argument.text)
        ) recordError(argument.text, argument);
      }
    }
    if (!isServerFile && ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      ['setMessage', 'setError', 'setFeedback'].includes(node.expression.text)) {
      const collectMessages = (value) => {
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
          recordError(value.text, value);
          return;
        }
        if (ts.isObjectLiteralExpression(value)) {
          for (const property of value.properties) {
            if (ts.isPropertyAssignment(property) && property.name.getText(parsed).replace(/^['"]|['"]$/g, '') === 'text')
              collectMessages(property.initializer);
          }
          return;
        }
        if (ts.isConditionalExpression(value)) {
          collectMessages(value.whenTrue);
          collectMessages(value.whenFalse);
        }
      };
      for (const argument of node.arguments) collectMessages(argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}

const uk = dictionaryKeys(new Set(['uk', 'supplementalUk', 'catalogUk', 'interfaceUk', 'errorUk', 'serverErrorUk']));
const ru = dictionaryKeys(new Set(['ru', 'supplementalRu', 'catalogRu', 'interfaceRu', 'errorRu', 'serverErrorRu']));
const missing = [...phrases].filter(([phrase]) => !uk.has(phrase) || !ru.has(phrase));
for (const [phrase, locations] of missing) {
  console.log(`${JSON.stringify(phrase)}\t${uk.has(phrase) ? '' : 'UK '}${ru.has(phrase) ? '' : 'RU '}\t${locations.join(', ')}`);
}
console.log(`\nAudited phrases: ${phrases.size}; missing: ${missing.length}; UK keys: ${uk.size}; RU keys: ${ru.size}`);
if (process.argv.includes('--check') && missing.length > 0) process.exitCode = 1;
