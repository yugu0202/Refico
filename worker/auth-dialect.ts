import {
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
} from "kysely";
import type { Database } from "./database.ts";

// Better Auth uses its built-in SQLite/Kysely adapter with our request-scoped
// Turso connection. Auth queries and domain queries therefore share one DB.
export function authDialect(database: Database): Dialect {
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      const result = await database
        .prepare(query.sql)
        .bind(...query.parameters)
        .all<R>();
      return {
        rows: result.results,
        numAffectedRows: BigInt(result.meta.changes),
        insertId:
          result.meta.last_row_id == null
            ? undefined
            : BigInt(result.meta.last_row_id),
      };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("Streaming is not supported");
    },
  };
  const unsupported = async () => {
    throw new Error("Use Database.batch() for atomic operations");
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    beginTransaction: unsupported,
    commitTransaction: unsupported,
    rollbackTransaction: unsupported,
    async releaseConnection() {},
    async destroy() {},
  };
  return {
    createDriver: () => driver,
    createAdapter: () => new SqliteAdapter(),
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>) => new SqliteIntrospector(db),
  };
}
