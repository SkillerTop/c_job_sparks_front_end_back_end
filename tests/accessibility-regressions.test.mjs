import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('closed custom Select popups are removed from the rendered accessibility surface', async () => {
  const styles = await read('src/views/components/ui/SelectField.module.css');
  assert.match(styles, /\.popup\[data-closed\]\s*\{\s*display:\s*none;/);
});

test('invalid forms retry focus after React renders validation state', async () => {
  const source = await read('src/utils/accessibility.ts');
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /\[aria-invalid="true"\]/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /focus\(3\)/);
});

test('Radiant prize validation connects its message to the textarea', async () => {
  const source = await read('src/views/pages/AwardPage.tsx');
  assert.match(source, /aria-describedby=\{errors\.valuablePrizeDescription \? 'valuable-prize-error'/);
  assert.match(source, /id="valuable-prize-error"/);
});

test('Admin sections implement the ARIA tab pattern', async () => {
  const source = await read('src/views/pages/AdminPage.tsx');
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{tab === item\}/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /event\.key === 'ArrowRight'/);
});

test('Employee Recognition history is not role-limited', async () => {
  const source = await read('src/views/pages/RecognitionPage.tsx');
  assert.doesNotMatch(source, /canExpandHistory/);
  assert.match(source, /ownRecognitions\.length > 2/);
});

test('Rules uses configured Yellow limit and progressive category disclosure', async () => {
  const source = await read('src/views/pages/RulesPage.tsx');
  assert.match(source, /settings\.yellowQuarterlyLimit/);
  assert.doesNotMatch(source, />7 <LocalizedText>per employee per quarter/);
  assert.match(source, /Search award categories/);
  assert.match(source, /open=\{normalizedCategoryQuery \? true : undefined\}/);
});

test('route loading announcements do not expose pathname strings', async () => {
  const source = await read('src/app/AppRouter.tsx');
  assert.doesNotMatch(source, /aria-label=\{`Loading \$\{pathname\}`\}/);
});
