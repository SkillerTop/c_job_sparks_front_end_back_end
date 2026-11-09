import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SEED_CATEGORY_CATALOG } from '../src/category-catalog.js';

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
    '0008_microsoft_identity.sql',
    '0009_performance_import_flags.sql',
    '0010_performance_rule_versions.sql',
    '0011_complete_spark_category_catalog.sql',
    '0012_safe_employee_deletion.sql',
    '0013_reward_fulfillment_and_monthly_reports.sql',
    '0014_product_fulfillment_contact.sql',
    '0015_test_fulfillment_contact.sql',
    '0016_graph_mail_delivery.sql',
    '0017_product_catalog_deletion.sql',
    '0018_content_spelling_cleanup.sql',
    '0019_shop_category_catalog.sql',
    '0020_shop_product_locations.sql',
    '0021_security_workflow_and_retention.sql',
    '0022_office_manager_and_employee_coordinators.sql',
    '0023_composite_shop_prices.sql',
    '0024_task_board.sql',
    '0025_task_board_composite_rewards.sql',
  ]);
  for (const table of [
    'users', 'employees', 'departments', 'roles', 'role_assignments', 'projects', 'project_members',
    'access_requests', 'sessions', 'spark_accounts', 'spark_ledger_entries', 'spark_operations',
    'spark_categories', 'spark_category_versions', 'rule_set_versions', 'recognitions', 'award_requests',
    'approval_actions', 'quality_gates', 'achievements', 'performance_imports', 'performance_import_rows',
    'performance_records', 'conversion_operations', 'disenchant_requests', 'products', 'product_versions',
    'stock_movements', 'purchases', 'purchase_items', 'inventory_items', 'inventory_events', 'effect_grants',
    'notifications', 'media_assets', 'audit_events', 'idempotency_keys', 'outbox_events',
    'external_identities', 'microsoft_auth_requests',
    'reward_fulfillment_contacts', 'reward_fulfillments', 'disenchant_reports', 'disenchant_report_items',
    'employee_coordinators', 'task_board_approval_sessions', 'task_board_tasks', 'task_board_events',
  ]) assert.match(sql, new RegExp(`CREATE TABLE app\\.${table}\\s*\\(`));
});

test('Task Board schema enforces approval, state, audit and single-credit invariants', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0024_task_board.sql'), 'utf8');
  assert.match(migration, /reward_amount integer NOT NULL CHECK \(reward_amount > 0/);
  assert.match(migration, /second_confirmed_at IS NULL OR first_confirmed_at IS NOT NULL/);
  assert.match(migration, /reward_operation_id uuid UNIQUE/);
  assert.match(migration, /status IN \('Active', 'Booked', 'Completed', 'Cancelled'\)/);
  assert.match(migration, /CREATE TRIGGER task_board_events_immutable/);
  assert.match(migration, /TaskBooked/);
  assert.match(migration, /TaskRewardFailed/);
});

test('Task Board rewards support one to three validated spendable Spark components', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0025_task_board_composite_rewards.sql'), 'utf8');
  assert.match(migration, /CREATE FUNCTION app\.valid_spendable_spark_components/);
  assert.match(migration, /jsonb_array_length\(value\) NOT BETWEEN 1 AND 3/);
  assert.match(migration, /spark_type NOT IN \('White', 'Yellow', 'Blue'\)/);
  assert.match(migration, /ALTER TABLE app\.task_board_approval_sessions[\s\S]+ADD COLUMN reward_components jsonb/);
  assert.match(migration, /ALTER TABLE app\.task_board_tasks[\s\S]+ADD COLUMN reward_components jsonb/);
});

test('shop prices support one to three atomic Spark components', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0023_composite_shop_prices.sql'), 'utf8');
  assert.match(migration, /ALTER TABLE app\.product_versions[\s\S]+ADD COLUMN price_components jsonb/);
  assert.match(migration, /ALTER TABLE app\.purchases[\s\S]+ADD COLUMN price_components jsonb/);
  assert.match(migration, /ALTER TABLE app\.purchase_items[\s\S]+ADD COLUMN unit_price_components jsonb/);
  assert.match(migration, /jsonb_array_length\(price_components\) BETWEEN 1 AND 3/);
  assert.match(migration, /DISABLE TRIGGER product_versions_published_immutable[\s\S]+UPDATE app\.product_versions[\s\S]+ENABLE TRIGGER product_versions_published_immutable/);
});

test('office managers and multiple employee coordinators are schema-backed', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0022_office_manager_and_employee_coordinators.sql'), 'utf8');
  assert.match(migration, /'Office Manager'/);
  assert.match(migration, /CREATE TABLE app\.employee_coordinators/);
  assert.match(migration, /PRIMARY KEY \(employee_id, coordinator_employee_id\)/);
  assert.match(migration, /CHECK \(employee_id <> coordinator_employee_id\)/);
});

test('the catalog migration contains every server category definition', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0011_complete_spark_category_catalog.sql'), 'utf8');
  for (const category of SEED_CATEGORY_CATALOG) {
    assert.match(migration, new RegExp(category.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
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
  const hardening = await readFile(resolve(migrationsDirectory, '0021_security_workflow_and_retention.sql'), 'utf8');
  assert.match(hardening, /fulfillment_kind <> 'Virtual'/);
  assert.match(hardening, /ALTER COLUMN effect_code DROP NOT NULL/);
});

test('workflow cancellation and idempotency retention are schema-backed', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0021_security_workflow_and_retention.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN cancellation_operation_id uuid UNIQUE/);
  assert.match(migration, /ADD COLUMN cancelled_at timestamptz/);
  assert.match(migration, /interval '72 hours'/);
  assert.match(migration, /idempotency_keys_expiry_idx/);
});

test('non-virtual shop rewards have a server-owned fulfillment contact', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0014_product_fulfillment_contact.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN fulfillment_contact_id uuid/);
  assert.match(migration, /fulfillment_kind <> 'Virtual' AND fulfillment_contact_id IS NOT NULL/);
});

test('catalog deletion preserves immutable shop history', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0017_product_catalog_deletion.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN deleted_at timestamptz/);
  assert.match(migration, /ADD COLUMN deleted_by_user_id uuid/);
  assert.doesNotMatch(migration, /DELETE FROM app\.(purchase_items|inventory_items|spark_ledger_entries)/);
});

test('shop category migration publishes the configured catalog and remaps existing products', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0019_shop_category_catalog.sql'), 'utf8');
  for (const category of ['Merch', 'Subscription', 'Certificate', 'Tool', 'Service', 'Other'])
    assert.match(migration, new RegExp(`'${category}'`));
  assert.match(migration, /UPDATE app\.products AS product/);
  assert.match(migration, /fulfillment_kind = 'Certificate' THEN 'certificate'/);
  assert.match(migration, /code NOT IN \('merch', 'subscription', 'certificate', 'tool', 'service', 'other'\)/);
});

test('shop location migration gives existing products all supported locations', async () => {
  const migration = await readFile(resolve(migrationsDirectory, '0020_shop_product_locations.sql'), 'utf8');
  for (const location of ['Ukraine', 'Poland', 'Bulgaria']) assert.match(migration, new RegExp(`'${location}'`));
  assert.match(migration, /ADD COLUMN available_locations text\[\] NOT NULL/);
  assert.match(migration, /USING gin \(available_locations\)/);
});
