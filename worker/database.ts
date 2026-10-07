import { connect, type Connection } from "@tursodatabase/serverless";
import type { Env } from "./env.ts";

export interface QueryResult<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number; last_row_id?: number };
}
export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  run<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
}
export interface Database {
  prepare(sql: string): PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: PreparedStatement[],
  ): Promise<QueryResult<T>[]>;
}

export function databaseBackend(env: Pick<Env, "DB_BACKEND">) {
  const backend = env.DB_BACKEND ?? "d1";
  if (backend !== "d1" && backend !== "turso")
    throw new Error("DB_BACKEND must be d1 or turso");
  return backend;
}
export function databaseConfigured(env: Env) {
  return databaseBackend(env) === "turso"
    ? Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN)
    : Boolean(env.DB);
}

type TursoResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid?: bigint | string | number | null;
};
function result<T>(r: TursoResult): QueryResult<T> {
  return {
    results: r.rows.map(
      (row) =>
        Object.fromEntries(
          r.columns.map((column) => [column, row[column]]),
        ) as T,
    ),
    meta: {
      changes: r.rowsAffected,
      ...(r.lastInsertRowid == null
        ? {}
        : { last_row_id: Number(r.lastInsertRowid) }),
    },
  };
}
class TursoStatement implements PreparedStatement {
  readonly database: TursoDatabase;
  readonly sql: string;
  readonly values: unknown[];
  constructor(database: TursoDatabase, sql: string, values: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: unknown[]) {
    return new TursoStatement(this.database, this.sql, values);
  }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    return (await this.database.batch<T>([this]))[0];
  }
  run<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    return this.all<T>();
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.all<Record<string, unknown>>()).results[0];
    if (!row) return null;
    return (column ? (row[column] ?? null) : row) as T | null;
  }
}
// One connection per Worker request: mutable Hrana batons must never be shared
// across unrelated requests. Preparing SQL is local (no describe round trip).
export class TursoDatabase implements Database {
  readonly connection: Connection;
  private initialization?: Promise<void>;
  constructor(connection: Connection) {
    this.connection = connection;
  }
  prepare(sql: string) {
    return new TursoStatement(this, sql);
  }
  async batch<T = Record<string, unknown>>(statements: PreparedStatement[]) {
    const sql = statements.map((s) => {
      if (!(s instanceof TursoStatement) || s.database !== this)
        throw new Error("Statement belongs to a different database");
      return { sql: s.sql, args: s.values };
    });
    if (!sql.length) return [];
    // PRAGMA must run before BEGIN, on the same connection. Deferred foreign
    // keys protect snapshots and cascades clear membership preferences.
    this.initialization ??= this.connection.exec("PRAGMA foreign_keys = ON");
    await this.initialization;
    // Turso's default batch is NOT atomic. Explicit deferred mode provides both
    // consistent snapshots and all-or-nothing writes without Concurrent Writes.
    const results: TursoResult[] = await this.connection.batch(sql, "deferred");
    return results.map((r) => result<T>(r));
  }
  close() {
    return this.connection.close();
  }
}
export function openDatabase(env: Env): Database {
  if (!databaseConfigured(env)) throw new Error("Database is not configured");
  if (databaseBackend(env) === "d1")
    return env.DB!.withSession("first-primary");
  return new TursoDatabase(
    connect({
      url: env.TURSO_DATABASE_URL!,
      authToken: env.TURSO_AUTH_TOKEN!,
    }),
  );
}
