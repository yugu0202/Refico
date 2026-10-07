// Local Hrana test server: exercises the real fetch-based Turso driver against
// SQLite, including session-scoped PRAGMAs, conditional batch and COMMIT failure.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeValue, decodeValue } from "@tursodatabase/serverless";

type Condition = {
  type: string;
  step?: number;
  cond?: Condition;
  conds?: Condition[];
};
export async function testTursoServer() {
  const directory = mkdtempSync(join(tmpdir(), "refico-turso-"));
  const filename = join(directory, "db.sqlite");
  const sqlite = new DatabaseSync(filename);
  const sessions = new Map<string, DatabaseSync>();
  const queries: string[] = [];
  let next = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const baton = body.baton ?? String(++next);
    let db = sessions.get(baton);
    if (!db) {
      db = new DatabaseSync(filename);
      sessions.set(baton, db);
    }
    const results: unknown[] = [];
    let closed = false;
    for (const request of body.requests) {
      try {
        let response: unknown;
        if (request.type === "close") {
          db.close();
          sessions.delete(baton);
          closed = true;
          response = { type: "close" };
        } else if (request.type === "get_autocommit") {
          response = {
            type: "get_autocommit",
            is_autocommit: !db.isTransaction,
          };
        } else if (request.type === "sequence") {
          queries.push(request.sql);
          db.exec(request.sql);
          response = { type: "sequence" };
        } else if (request.type === "batch") {
          const stepResults: (unknown | null)[] = [];
          const errors: (unknown | null)[] = [];
          const matches = (condition?: Condition): boolean => {
            if (!condition) return true;
            if (condition.type === "ok")
              return stepResults[condition.step!] != null;
            if (condition.type === "error")
              return errors[condition.step!] != null;
            if (condition.type === "not") return !matches(condition.cond);
            if (condition.type === "and")
              return condition.conds!.every(matches);
            if (condition.type === "or") return condition.conds!.some(matches);
            if (condition.type === "is_autocommit") return !db!.isTransaction;
            throw new Error(`Unknown condition ${condition.type}`);
          };
          for (const step of request.batch.steps) {
            if (!matches(step.condition)) {
              stepResults.push(null);
              errors.push(null);
              continue;
            }
            try {
              queries.push(step.stmt.sql);
              const stmt = db.prepare(step.stmt.sql);
              const args = (step.stmt.args ?? []).map(decodeValue);
              const cols = stmt
                .columns()
                .map((c) => ({ name: c.name, decltype: c.type ?? "" }));
              let rows: unknown[][] = [];
              let changes = 0,
                lastInsertRowid = 0;
              if (cols.length) {
                rows = stmt
                  .all(...args)
                  .map((r) => cols.map((c) => encodeValue(r[c.name])));
              } else {
                const r = stmt.run(...args);
                changes = Number(r.changes);
                lastInsertRowid = Number(r.lastInsertRowid);
              }
              stepResults.push({
                cols,
                rows,
                affected_row_count: changes,
                last_insert_rowid: String(lastInsertRowid),
              });
              errors.push(null);
            } catch (e) {
              stepResults.push(null);
              errors.push({
                message: (e as Error).message,
                code: "SQLITE_ERROR",
              });
            }
          }
          response = {
            type: "batch",
            result: { step_results: stepResults, step_errors: errors },
          };
        } else throw new Error(`Unsupported request ${request.type}`);
        results.push({ type: "ok", response });
      } catch (e) {
        results.push({
          type: "error",
          error: { message: (e as Error).message, code: "SQLITE_ERROR" },
        });
      }
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ baton: closed ? null : baton, base_url: null, results }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url,
    sqlite,
    queries,
    async close() {
      for (const db of sessions.values()) db.close();
      sessions.clear();
      sqlite.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
