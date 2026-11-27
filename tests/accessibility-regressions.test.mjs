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

test('award form refreshes preserve a successful submission confirmation', async () => {
  const source = await read('src/views/pages/AwardPage.tsx');
  const preserveSuccessCalls = source.match(
    /setMessage\(\(current\) => current\?\.tone === 'success' \? current : null\)/g,
  ) ?? [];
  assert.equal(preserveSuccessCalls.length, 3);
  assert.doesNotMatch(source, /setMessage\(null\)/);
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

test('Peer Recognition uses one global recipient field without a department gate', async () => {
  const page = await read('src/views/pages/RecognitionPage.tsx');
  const controller = await read('src/controllers/useRecognitionController.ts');

  assert.doesNotMatch(page, /Recognition department|Choose a department/);
  assert.doesNotMatch(controller, /activeDepartmentId|selectDepartment/);
  assert.match(page, /ariaLabel="Recognition recipient"/);
});

test('Achievements leaderboard filters and ranking states are keyboard and screen-reader exposed', async () => {
  const page = await read('src/views/pages/AchievementsPage.tsx');
  const component = await read('src/views/components/achievements/LeaderboardCard.tsx');

  assert.match(page, /LeaderboardCard/);
  assert.ok(page.indexOf('<LeaderboardCard') < page.indexOf('recognition-history-title'));
  assert.match(component, /aria-busy=\{controller\.loading\}/);
  assert.match(component, /ariaLabel="Filter leaderboard by department"/);
  assert.doesNotMatch(component, /aria-pressed|Sort leaderboard by Spark value/);
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /role="alert"/);
});

test('Rules uses configured Yellow limit and progressive category disclosure', async () => {
  const source = await read('src/views/pages/RulesPage.tsx');
  const styles = await read('src/views/styles/rules.module.css');
  assert.match(source, /settings\.yellowQuarterlyLimit/);
  assert.doesNotMatch(source, />7 <LocalizedText>per employee per quarter/);
  assert.match(source, /Search award categories/);
  assert.match(source, /open=\{normalizedCategoryQuery \? true : undefined\}/);
  assert.match(styles, /\.rulesDisclosure li > div\s*\{[^}]*flex:\s*1 1 12rem;/s);
  assert.match(styles, /\.rulesDisclosure li span\s*\{[^}]*max-width:\s*46%;[^}]*flex:\s*0 1 46%;/s);
  assert.match(styles, /@media \(max-width:\s*42rem\)[^]*\.rulesDisclosure li[^]*flex-direction:\s*column;/);
});

test('route loading announcements do not expose pathname strings', async () => {
  const source = await read('src/app/AppRouter.tsx');
  assert.doesNotMatch(source, /aria-label=\{`Loading \$\{pathname\}`\}/);
});

test('restricted and missing routes provide safe back navigation', async () => {
  const button = await read('src/views/components/common/BackNavigationButton.tsx');
  const forbidden = await read('src/views/pages/ForbiddenPage.tsx');
  const notFound = await read('src/views/pages/NotFoundPage.tsx');

  assert.match(button, /window\.history\.state\?\.idx/);
  assert.match(button, /navigate\(-1\)/);
  assert.match(button, /navigate\(fallbackTo, \{ replace: true \}\)/);
  assert.match(button, /type="button"/);
  assert.match(forbidden, /<BackNavigationButton \/>/);
  assert.match(notFound, /<BackNavigationButton \/>/);
});

test('shop cards expose an accessible full-description toggle and square media', async () => {
  const source = await read('src/views/components/shop/ProductCard.tsx');
  const styles = await read('src/views/styles/shop.module.css');

  assert.match(source, /aria-expanded=\{descriptionExpanded\}/);
  assert.match(source, /aria-controls=\{descriptionId\}/);
  assert.match(source, /showFullDescription/);
  assert.match(source, /showLessDescription/);
  assert.match(styles, /\.visualcard\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1;/s);
  assert.match(styles, /\.productDescription\s*\{[^}]*-webkit-line-clamp:\s*4;/s);
  assert.match(styles, /\.productDescriptionExpanded\s*\{[^}]*overflow:\s*visible;/s);
});

test('shop location disclaimer is prominent and exposed as a note', async () => {
  const page = await read('src/views/pages/ShopPage.tsx');
  const dialog = await read('src/views/components/shop/ShopLocationDialog.tsx');
  const constants = await read('src/constants/shop.ts');

  assert.match(page, /shopLocationDisclaimer[^]*role="note"/);
  assert.match(dialog, /shopLocationDisclaimer[^]*role="note"/);
  assert.match(constants, /actual product design may differ from the image shown/);
});

test('department memberships use a compact searchable disclosure with a fixed primary option', async () => {
  const source = await read('src/views/components/admin/DepartmentMembershipPicker.tsx');
  const styles = await read('src/views/styles/app.module.css');

  assert.match(source, /<details className=\{styles\.membershipPicker\}>/);
  assert.match(source, /<summary className=\{styles\.membershipSummary\}>/);
  assert.match(source, /type="search"/);
  assert.match(source, /disabled=\{disabled \|\| primary\}/);
  assert.match(styles, /\.membershipOptions\s*\{[^}]*max-height:\s*11rem;/s);
});
