import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');

const schemaSql = async () => {
  const names = (await readdir(migrationsDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const sources = await Promise.all(names.map((name) => readFile(resolve(migrationsDirectory, name), 'utf8')));
  return { names, sql: sources.join('\n') };
};

test('the MVP schema is complete and ordered', async () => {
  const { names, sql } = await schemaSql();
  assert.deepEqual(names, [
    '0001_identity_and_directory.sql',
    '0002_spark_ledger_and_rules.sql',
    '0003_recognition_awards_and_approvals.sql',
    '0004_performance_conversion_and_disenchant.sql',
    '0005_shop_inventory_and_media.sql',
    '0006_notifications_audit_idempotency_outbox.sql',
    '0007_seed_roles.sql',
  ]);
  for (const table of [
    'users', 'employees', 'departments', 'roles', 'role_assignments', 'projects', 'project_members',
    'access_requests', 'sessions', 'spark_accounts', 'spark_ledger_entries', 'spark_operations',
    'spark_categories', 'spark_category_versions', 'rule_set_versions', 'recognitions', 'award_requests',
    'approval_actions', 'quality_gates', 'achievements', 'performance_imports', 'performance_import_rows',
    'performance_records', 'conversion_operations', 'disenchant_requests', 'products', 'product_versions',
    'stock_movements', 'purchases', 'purchase_items', 'inventory_items', 'inventory_events', 'effect_grants',
    'notifications', 'media_assets', 'audit_events', 'idempotency_keys', 'outbox_events',
  ]) assert.match(sql, new RegExp(`CREATE TABLE app\\.${table}\\s*\\(`));
});

test('financial and audit history is protected by database triggers', async () => {
  const { sql } = await schemaSql();
  for (const trigger of [
    'spark_ledger_immutable', 'spark_operations_immutable', 'approval_actions_immutable', 'achievements_immutable',
    'stock_movements_immutable', 'inventory_events_immutable', 'audit_events_immutable',
  ]) assert.match(sql, new RegExp(`CREATE TRIGGER ${trigger}`));
  assert.match(sql, /Radiant Sparks cannot be spent, converted, or disenchanted/);
  assert.match(sql, /next_balance < 0/);
  assert.match(sql, /idempotency_key text NOT NULL/);
});

test('unsupported product effects cannot be published as purchasable', async () => {
  const { sql } = await schemaSql();
  assert.match(sql, /is_purchasable = false\s+OR effect_code IN \('theme_unlock', 'profile_frame', 'badge_unlock', 'focus_mode'\)/);
});
