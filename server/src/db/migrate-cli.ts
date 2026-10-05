import { getEnvironment } from '../config/env.js';
import { closePool, getPool } from './pool.js';
import { inspectMigrations, runMigrations } from './migrations.js';

const main = async () => {
  const command = process.argv[2] ?? 'up';
  const environment = getEnvironment();
  const pool = getPool();

  if (command === 'up') {
    const applied = await runMigrations(pool, environment.MIGRATIONS_DIR);
    for (const migration of applied) process.stdout.write(`applied ${migration.fileName}\n`);
    if (applied.length === 0) process.stdout.write('schema is up to date\n');
    return;
  }

  if (command === 'status') {
    const status = await inspectMigrations(pool, environment.MIGRATIONS_DIR);
    for (const migration of status.local) {
      const state = status.plan.pending.some((pending) => pending.version === migration.version)
        ? 'pending'
        : 'applied';
      process.stdout.write(`${state.padEnd(8)} ${migration.fileName}\n`);
    }
    return;
  }

  throw new Error(`Unknown migration command "${command}". Use "up" or "status".`);
};

try {
  await main();
} finally {
  await closePool();
}
