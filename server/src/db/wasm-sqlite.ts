import { createRequire } from 'node:module';
import type { Db, DbFactory, DbStatement } from './types.js';

const runtimeRequire = createRequire(import.meta.url);

type WasmRunResult = {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
};

type WasmStatement = {
  run(values?: unknown): WasmRunResult;
  get(values?: unknown): unknown;
  all(values?: unknown): unknown[];
  finalize(): void;
};

type WasmDatabase = {
  prepare(sql: string): WasmStatement;
  exec(sql: string): void;
  close(): void;
};

type WasmModule = {
  Database: new (path: string) => WasmDatabase;
};

/**
 * `node-sqlite3-wasm` adapter — a pure-JavaScript (WebAssembly) SQLite with
 * direct file-system persistence and no native addons. It backs the standalone
 * Linux browser bundle so that build runs on any Node.js 18+ without the
 * built-in `node:sqlite` module (which only exists on Node 22.13+/24.x).
 *
 * The adapter exposes the same small synchronous contract the server uses and
 * implements better-sqlite3-style nested transactions with savepoints, exactly
 * like {@link nodeSqliteFactory}.
 *
 * One incompatibility with better-sqlite3/node:sqlite is handled here:
 * `node-sqlite3-wasm` binds named parameters by their full prefixed name
 * (`@foo`), while the server passes a bare-key object (`{ foo }`). Rather than
 * rewrite the SQL to positional `?` (which would break SQLite's deduplication
 * of a repeated name — `@now, @now` is one parameter, not two), we leave the
 * SQL untouched and build a prefixed-key object that the driver binds by name.
 * {@link buildPrefixedBindObject} does that, deliberately skipping SQL string
 * literals, quoted identifiers, and comments so data such as the Cloudflare
 * `@cf/*` model ids stored inside string literals is left intact.
 */

function loadWasmSqlite(): WasmModule {
  try {
    // Loaded lazily so the (large) WASM module is only initialized when this
    // factory is actually selected. Externalized by the Linux bundle build, so
    // this resolves to the real CJS package at runtime (its internal
    // `require('node:fs')` calls run natively, not through a bundler shim).
    return runtimeRequire('node-sqlite3-wasm') as WasmModule;
  } catch (cause) {
    throw new Error(
      'The node-sqlite3-wasm package is not available. This portable build needs it for SQLite; reinstall dependencies.',
      { cause },
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function numberResult(value: number | bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`SQLite returned an integer outside JavaScript's safe range: ${value}`);
  }
  return n;
}

/**
 * Build a prefixed-key bind object for a statement's named parameters
 * (`@name`, `:name`, `$name`), suitable for `node-sqlite3-wasm`'s by-name
 * binding. For each distinct parameter name found in `sql` (in order of first
 * appearance), one key — `prefix + name` using that first occurrence's prefix —
 * is set to the value from the bare-key `params` object.
 *
 * Binding by name (not position) is what lets SQLite deduplicate a repeated
 * name: `VALUES (@now, @now)` is a single parameter, and binding `@now` once
 * covers both slots. Only the first occurrence's prefix is used, so a name
 * that appears under mixed prefixes still binds once.
 *
 * The scan is character-by-character and deliberately skips:
 *   - single-quoted string literals (`'...'`, with `''` escapes) — these hold
 *     data such as the `@cf/cloudflare/...` model ids and must not be read as
 *     placeholders;
 *   - double-quoted identifiers (`"..."`) and backtick identifiers (`` `...` ``);
 *   - `--` line comments and `/* *\/` block comments.
 *
 * Only outside those regions is a `[@:$][A-Za-z_0-9]...` token treated as a
 * placeholder. Names are matched bare (prefix stripped), matching how
 * better-sqlite3/node:sqlite accept named objects.
 */
export function buildPrefixedBindObject(
  sql: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const seen = new Set<string>();
  let i = 0;
  const n = sql.length;
  const isIdentChar = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

  while (i < n) {
    const ch = sql[i];

    // Line comment: -- ... to end of line
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }

    // Single-quoted string literal (skip entirely)
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier (skip entirely)
    if (ch === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Backtick-quoted identifier (skip entirely)
    if (ch === '`') {
      i++;
      while (i < n) {
        if (sql[i] === '`') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Named parameter: @name, :name, $name (also numeric @1, :1, $1)
    if (ch === '@' || ch === ':' || ch === '$') {
      const next = sql[i + 1];
      if (next !== undefined && isIdentChar(next)) {
        let j = i + 1;
        while (j < n && isIdentChar(sql[j])) j++;
        const name = sql.slice(i + 1, j);
        // A valid placeholder name starts with a letter/underscore (identifier)
        // or is numeric (e.g. @1). Anything else is left untouched.
        if (/^[A-Za-z_]/.test(name) || /^\d+$/.test(name)) {
          if (!seen.has(name)) {
            seen.add(name);
            if (Object.prototype.hasOwnProperty.call(params, name)) {
              result[ch + name] = params[name];
            } else if (Object.prototype.hasOwnProperty.call(params, ch + name)) {
              result[ch + name] = params[ch + name];
            } else {
              throw new Error(`Missing SQL bind parameter: ${ch}${name}`);
            }
          }
          i = j;
          continue;
        }
      }
    }

    i++;
  }

  return result;
}

/** Resolve a variadic `run/get/all` argument list into the bind payload for the
 *  underlying statement. Returns a prefixed-key object when a single bare-key
 *  object was passed (bound by name), or the positional array / `undefined`
 *  for a spread of values (bound by position). */
function toBind(sql: string, params: unknown[]): unknown {
  if (params.length === 1 && isPlainObject(params[0])) {
    return buildPrefixedBindObject(sql, params[0]);
  }
  return params.length === 0 ? undefined : params;
}

function wrapStatement(raw: WasmDatabase, sql: string): DbStatement {
  // node-sqlite3-wasm keeps a cursor (and therefore a read lock) open on a
  // statement until it is explicitly finalized. The `DbStatement` contract has
  // no finalize hook and callers reuse a prepared statement across calls, so we
  // re-prepare from `sql` on every operation and finalize in a `finally`. That
  // keeps no cursor open between calls — essential, because a lingering cursor
  // from e.g. `PRAGMA journal_mode` would otherwise hold a read lock that
  // blocks DDL (surfacing as "database table is locked"). SQLite re-parses are
  // cheap and this is not a hot path beyond ordinary request logging.
  return {
    get: (...params) => {
      const stmt = raw.prepare(sql);
      try {
        const row = stmt.get(toBind(sql, params)) ?? undefined;
        // node-sqlite3-wasm returns `null` for no row; normalize to `undefined`
        // to match better-sqlite3 / node:sqlite semantics.
        return row === null ? undefined : row;
      } finally {
        stmt.finalize();
      }
    },
    all: (...params) => {
      const stmt = raw.prepare(sql);
      try {
        return stmt.all(toBind(sql, params)) as unknown[];
      } finally {
        stmt.finalize();
      }
    },
    run: (...params) => {
      const stmt = raw.prepare(sql);
      try {
        const result = stmt.run(toBind(sql, params));
        return {
          changes: numberResult(result.changes),
          lastInsertRowid: numberResult(result.lastInsertRowid),
        };
      } finally {
        stmt.finalize();
      }
    },
  };
}

/**
 * `node-sqlite3-wasm` adapter for the standalone Linux browser bundle. Pure
 * WebAssembly SQLite with direct file persistence — no native addons, runs on
 * Node.js 18+ — implementing the same `Db` contract as the other drivers.
 */
export const wasmSqliteFactory: DbFactory = (resolvedPath) => {
  const { Database } = loadWasmSqlite();
  const raw = new Database(resolvedPath);
  let transactionDepth = 0;
  let savepointSequence = 0;

  const database: Db = {
    name: resolvedPath,
    memory: resolvedPath === ':memory:',
    prepare: (sql) => wrapStatement(raw, sql),
    exec: (sql) => raw.exec(sql),
    pragma: (source) => {
      // Finalize the pragma cursor so it does not hold a read lock that would
      // block later DDL (e.g. "database table is locked" during migrations).
      const stmt = raw.prepare(`PRAGMA ${source}`);
      try {
        return stmt.all();
      } finally {
        stmt.finalize();
      }
    },
    close: () => raw.close(),
    transaction: <F extends (...args: any[]) => unknown>(fn: F): F => {
      const wrapped = function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
        const outermost = transactionDepth === 0;
        const savepoint = `ossllmapi_tx_${++savepointSequence}`;

        raw.exec(outermost ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
        transactionDepth += 1;

        try {
          const result = fn.apply(this, args) as ReturnType<F>;
          if (result && typeof (result as { then?: unknown }).then === 'function') {
            throw new Error('SQLite transaction callbacks must be synchronous');
          }
          raw.exec(outermost ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          try {
            if (outermost) {
              raw.exec('ROLLBACK');
            } else {
              raw.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              raw.exec(`RELEASE SAVEPOINT ${savepoint}`);
            }
          } catch {
            // Preserve the original callback/commit error.
          }
          throw error;
        } finally {
          transactionDepth -= 1;
        }
      };
      return wrapped as F;
    },
  };

  return database;
};
