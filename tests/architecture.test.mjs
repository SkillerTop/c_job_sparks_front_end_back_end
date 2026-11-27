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

test('Award recipients use the authoritative eligibility endpoint', () => {
  const awardPage = readFileSync(join(sourceRoot, 'views', 'pages', 'AwardPage.tsx'), 'utf8');
  const recipientsController = readFileSync(join(sourceRoot, 'controllers', 'useAwardRecipients.ts'), 'utf8');
  assert.match(awardPage, /useAwardRecipients/);
  assert.doesNotMatch(awardPage, /selectAwardTargets/);
  assert.match(recipientsController, /\/api\/v1\/eligible-recipients\?purpose=award/);
});

test('GPM Award scope is company-wide without a department field', () => {
  const awardPage = readFileSync(join(sourceRoot, 'views', 'pages', 'AwardPage.tsx'), 'utf8');
  const selectors = readFileSync(join(sourceRoot, 'models', 'selectors.ts'), 'utf8');
  const recognitionBackend = readFileSync(join(sourceRoot, '..', 'server', 'src', 'recognition.ts'), 'utf8');

  assert.doesNotMatch(awardPage, /Award department|selectedDepartmentId/);
  assert.match(selectors, /role === 'GPM'\) return true/);
  assert.match(
    recognitionBackend,
    /\(\$2='GPM'\)/,
  );
  assert.doesNotMatch(
    recognitionBackend,
    /\$2='GPM' AND EXISTS \([\s\S]*?membership\.department_id=ANY\(\$3::uuid\[\]\)/,
  );
  assert.doesNotMatch(recognitionBackend, /\['Head', 'Coordinator', 'GPM'\]\.includes\(principal\.role\)/);
});

test('Peer Recognition recipients use the global authoritative eligibility endpoint', () => {
  const recognitionPage = readFileSync(join(sourceRoot, 'views', 'pages', 'RecognitionPage.tsx'), 'utf8');
  const recognitionController = readFileSync(join(sourceRoot, 'controllers', 'useRecognitionController.ts'), 'utf8');
  const recipientsController = readFileSync(join(sourceRoot, 'controllers', 'useRecognitionRecipients.ts'), 'utf8');
  const rulesPage = readFileSync(join(sourceRoot, 'views', 'pages', 'RulesPage.tsx'), 'utf8');

  assert.match(recognitionController, /useRecognitionRecipients/);
  assert.match(recipientsController, /\/api\/v1\/eligible-recipients\?purpose=recognition/);
  assert.doesNotMatch(recognitionPage, /Recognition department|controller\.departmentId|selectDepartment/);
  assert.match(rulesPage, /Peer Recognition recipient selection is company-wide/);
  assert.doesNotMatch(rulesPage, /chooses a department directly in Peer recognition/);
});

test("Peer Recognition decisions use the recipient's current department scope", () => {
  const recognitionBackend = readFileSync(join(sourceRoot, '..', 'server', 'src', 'recognition.ts'), 'utf8');
  const routes = readFileSync(join(sourceRoot, '..', 'server', 'src', 'routes.ts'), 'utf8');

  assert.match(recognitionBackend, /current_recipient_department_id/);
  assert.match(recognitionBackend, /principalDepartmentIds\(principal\)\.includes\(recognition\.current_recipient_department_id\)/);
  assert.match(routes, /head\.id=department\.head_employee_id AND head\.is_active/);
  assert.match(routes, /RECIPIENT_HEAD_UNAVAILABLE/);
});

test('Achievements leaderboard uses a role-protected read model instead of client Ledger aggregation', () => {
  const routes = readFileSync(join(sourceRoot, '..', 'server', 'src', 'routes.ts'), 'utf8');
  const backend = readFileSync(join(sourceRoot, '..', 'server', 'src', 'leaderboard.ts'), 'utf8');
  const controller = readFileSync(join(sourceRoot, 'controllers', 'useLeaderboardController.ts'), 'utf8');
  const component = readFileSync(join(sourceRoot, 'views', 'components', 'achievements', 'LeaderboardCard.tsx'), 'utf8');

  assert.match(routes, /get\('\/api\/v1\/leaderboard'/);
  assert.match(routes, /requireWorkspaceSection\(principal, 'achievements'\)/);
  assert.match(routes, /cache-control', 'private, no-store'/);
  assert.match(backend, /JOIN app\.achievements achievement/);
  assert.match(backend, /current_performance\.status<>'Superseded'/);
  assert.match(backend, /LEADERBOARD_SPARK_WEIGHTS\.White/);
  assert.match(backend, /achievement\.spark_type<>'Radiant'/);
  assert.match(controller, /\/api\/v1\/leaderboard/);
  assert.match(controller, /calculateLeaderboardScore\(calculateLifetimeEarnings/);
  assert.match(component, /All users/);
  assert.match(component, /See top 10/);
  assert.doesNotMatch(component, /LEADERBOARD_SPARK_TYPES|setSparkType|activeSpark/);
});
