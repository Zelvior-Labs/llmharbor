import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectDb, defaultDbFactory } from '../../db/index.js';
import { wasmSqliteFactory, buildPrefixedBindObject } from '../../db/wasm-sqlite.js';
import { runMigrationsSync } from '../../db/migrate/runner.js';
import type { Db } from '../../db/types.js';

// node-sqlite3-wasm is a pure-WASM package with no Node version requirement,
// so these run on every Node the suite targets (18+).

describe('wasm-sqlite Linux portable driver', () => {
  let db: Db | undefined;
  const tempDirs: string[] = [];

  afterEach(() => {
    db?.close?.();
    db = undefined;
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is selected when the headless build requests the wasm driver', () => {
    expect(defaultDbFactory('linux', 'wasm')).toBe(wasmSqliteFactory);
    // The wasm driver is not the default for any platform/driver combination.
    expect(defaultDbFactory('linux')).not.toBe(wasmSqliteFactory);
    expect(defaultDbFactory('linux', 'node:sqlite')).not.toBe(wasmSqliteFactory);
    expect(defaultDbFactory('android')).not.toBe(wasmSqliteFactory);
  });

  it('runs the complete application migration set', () => {
    db = connectDb(':memory:', { factory: wasmSqliteFactory, ensureDir: false });
    runMigrationsSync(db, 'up');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tables.map((row) => row.name)).toContain('api_keys');
    expect((db.prepare('SELECT COUNT(*) AS count FROM models').get() as { count: number }).count).toBeGreaterThan(0);
  });

  it('opens a file-backed database with file metadata and persists writes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ossllmapi-wasm-sqlite-'));
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'freeapi.db');

    db = connectDb(dbPath, { factory: wasmSqliteFactory });
    db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    db.prepare('INSERT INTO sample (value) VALUES (?)').run('persisted');

    expect(db.name).toBe(dbPath);
    expect(db.memory).toBe(false);
    expect(fs.existsSync(dbPath)).toBe(true);

    // Reopen: the row must survive (direct file persistence, no manual export).
    db.close?.();
    db = connectDb(dbPath, { factory: wasmSqliteFactory });
    expect((db.prepare('SELECT value FROM sample').get() as { value: string }).value).toBe('persisted');
  });

  it('binds named parameters by name, deduplicating repeated placeholders', () => {
    db = connectDb(':memory:', { factory: wasmSqliteFactory, ensureDir: false });
    db.exec('CREATE TABLE t (slug TEXT, title TEXT, created_ms INTEGER, updated_ms INTEGER)');

    // @now appears twice but is one SQLite parameter — binding by name (not
    // positional) is what makes the dedup work.
    db.prepare(
      `INSERT INTO t (slug, title, created_ms, updated_ms)
       VALUES (@slug, @title, @now, @now)`,
    ).run({ slug: 's1', title: 'T1', now: 123 });

    const row = db.prepare('SELECT * FROM t WHERE slug = ?').get('s1') as Record<string, unknown>;
    expect(row).toEqual({ slug: 's1', title: 'T1', created_ms: 123, updated_ms: 123 });
  });

  it('leaves @-prefixed data inside string literals untouched', () => {
    db = connectDb(':memory:', { factory: wasmSqliteFactory, ensureDir: false });
    db.exec('CREATE TABLE models (platform TEXT, model_id TEXT)');

    // The Cloudflare @cf/* ids are string-literal data, not bind parameters.
    db.prepare('INSERT INTO models (platform, model_id) VALUES (?, ?)').run(
      'cloudflare',
      '@cf/meta/llama-3.1-70b-instruct',
    );
    const row = db.prepare('SELECT model_id FROM models').get() as { model_id: string };
    expect(row.model_id).toBe('@cf/meta/llama-3.1-70b-instruct');
  });

  it('supports nested transaction commit and rollback semantics', () => {
    db = connectDb(':memory:', { factory: wasmSqliteFactory, ensureDir: false });
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');

    const outer = db.transaction(() => {
      db!.prepare('INSERT INTO items (value) VALUES (?)').run('outer');
      db!.transaction(() => {
        db!.prepare('INSERT INTO items (value) VALUES (?)').run('inner');
      })();

      try {
        db!.transaction(() => {
          db!.prepare('INSERT INTO items (value) VALUES (?)').run('rolled-back');
          throw new Error('rollback inner savepoint');
        })();
      } catch {
        // The outer transaction remains usable and commits.
      }
    });

    outer();

    const rows = db.prepare('SELECT value FROM items ORDER BY id').all() as { value: string }[];
    expect(rows.map((row) => row.value)).toEqual(['outer', 'inner']);
  });
});

describe('buildPrefixedBindObject', () => {
  it('maps bare keys to prefixed keys, one per distinct name', () => {
    const obj = buildPrefixedBindObject(
      'INSERT INTO t VALUES (@a, :b, $c, @a)',
      { a: 1, b: 2, c: 3 },
    );
    // @a appears twice but is one parameter; only the first prefix is used.
    expect(obj).toEqual({ '@a': 1, ':b': 2, '$c': 3 });
  });

  it('skips placeholders inside string literals and comments', () => {
    const obj = buildPrefixedBindObject(
      "INSERT INTO t VALUES ('@cf/cloudflare/x', @real) /* @skip */ -- @also",
      { real: 7 },
    );
    expect(obj).toEqual({ '@real': 7 });
  });

  it('throws when a named placeholder has no matching value', () => {
    expect(() => buildPrefixedBindObject('INSERT INTO t VALUES (@a, @b)', { a: 1 })).toThrow(
      /Missing SQL bind parameter: @b/,
    );
  });
});
