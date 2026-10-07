import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { D1Database, D1PreparedStatement } from "./env.ts";
export function testDatabase({
  migrations = readdirSync(new URL("../migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort(),
}: { migrations?: string[] } = {}) {
  const queries: string[] = [];
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations)
    sqlite.exec(
      readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  function prepare(
    sql: string,
    values: (string | number | null)[] = [],
  ): D1PreparedStatement {
    const statement = {
      bind(...args: (string | number | null)[]) {
        return prepare(sql, args);
      },
      async all() {
        queries.push(sql);
        const results = sqlite.prepare(sql).all(...values);
        return { success: true, results, meta: { changes: 0, last_row_id: 0 } };
      },
      async first(column?: string) {
        queries.push(sql);
        const row = sqlite.prepare(sql).get(...values);
        return column ? (row?.[column] ?? null) : (row ?? null);
      },
      async run() {
        queries.push(sql);
        const r = sqlite.prepare(sql).run(...values);
        return {
          success: true,
          results: [],
          meta: {
            changes: Number(r.changes),
            last_row_id: Number(r.lastInsertRowid),
          },
        };
      },
      async raw() {
        queries.push(sql);
        return sqlite
          .prepare(sql)
          .all(...values)
          .map((row) => Object.values(row));
      },
      execute() {
        queries.push(sql);
        const s = sqlite.prepare(sql);
        if (s.columns().length)
          return {
            success: true,
            results: s.all(...values),
            meta: { changes: 0 },
          };
        const r = s.run(...values);
        return {
          success: true,
          results: [],
          meta: {
            changes: Number(r.changes),
            last_row_id: Number(r.lastInsertRowid),
          },
        };
      },
    };
    return statement as unknown as D1PreparedStatement;
  }
  const db = {
    prepare,
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) =>
          (s as unknown as { execute(): unknown }).execute(),
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    withSession() {
      return db;
    },
  };
  return { sqlite, db: db as unknown as D1Database, queries };
}
export function addUser(sqlite: DatabaseSync, id: string) {
  sqlite
    .prepare(
      "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)",
    )
    .run(
      id,
      id,
      `${id}@example.com`,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}
