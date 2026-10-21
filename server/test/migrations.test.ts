import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  discoverMigrations,
  migrationChecksum,
  parseMigrationFileName,
  planMigrations,
  type AppliedMigration,
  type Migration,
  type MigrationIo,
} from '../src/db/migrations.js';

const migration = (version: string, fileName: string, sql: string): Migration => ({
  version,
  fileName,
  description: fileName.replace(/^\d+_|\.sql$/g, ''),
  sql,
  checksum: migrationChecksum(sql),
});

describe('migration utilities', () => {
  it('parses and canonicalizes a migration version', () => {
    assert.deepEqual(parseMigrationFileName('0007_seed_roles.sql'), {
      version: '7',
      description: 'seed_roles',
    });
    assert.throws(() => parseMigrationFileName('7-Seed.sql'), /Invalid migration file name/);
  });

  it('normalizes CRLF before computing a checksum', () => {
    assert.equal(migrationChecksum('SELECT 1;\r\n'), migrationChecksum('SELECT 1;\n'));
  });

  it('discovers migrations in numeric order through an injectable IO boundary', async () => {
    const files = new Map([
      ['0010_tenth.sql', 'SELECT 10;'],
      ['0002_second.sql', 'SELECT 2;'],
      ['README.md', 'ignored'],
    ]);
    const io: MigrationIo = {
      async listFiles() {
        return [...files.keys()];
      },
      async readText(path) {
        const fileName = path.replaceAll('\\', '/').split('/').at(-1) ?? '';
        const contents = files.get(fileName);
        if (contents === undefined) throw new Error('missing fixture');
        return contents;
      },
    };
    const discovered = await discoverMigrations('/migrations', io);
    assert.deepEqual(
      discovered.map((item) => item.version),
      ['2', '10'],
    );
  });

  it('rejects duplicate versions', async () => {
    const io: MigrationIo = {
      async listFiles() {
        return ['0001_first.sql', '0001_duplicate.sql'];
      },
      async readText() {
        return 'SELECT 1;';
      },
    };
    await assert.rejects(discoverMigrations('/migrations', io), /Duplicate migration version 1/);
  });

  it('plans only pending migrations and detects applied-file tampering', () => {
    const first = migration('1', '0001_first.sql', 'SELECT 1;');
    const second = migration('2', '0002_second.sql', 'SELECT 2;');
    const applied: AppliedMigration = {
      version: '1',
      fileName: first.fileName,
      checksum: first.checksum,
      appliedAt: new Date(0),
      executionMs: 1,
    };
    assert.deepEqual(planMigrations([first, second], [applied]).pending, [second]);
    assert.throws(
      () => planMigrations([first, second], [{ ...applied, checksum: '0'.repeat(64) }]),
      /Checksum mismatch/,
    );
    assert.throws(
      () =>
        planMigrations([first, second], [
          {
            ...applied,
            version: second.version,
            fileName: second.fileName,
            checksum: second.checksum,
          },
        ]),
      /older than an already-applied migration/,
    );
  });
});
