import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { emptyModel, modelTables } from "../src/domain/model.ts";
import { loadSnapshot, type Database } from "./repository.ts";
import type { D1Database, Env } from "./env.ts";
import worker from "./index.ts";

test("D1ランタイムのcompound SELECT制限内で全テーブルを1クエリで取得する", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      name: "snapshot-test",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      compatibilityDate: "2026-10-06",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = (await mf.getD1Database("DB")) as unknown as D1Database;
    // Minimal storage fixtures isolate this regression from domain validation.
    await db.batch([
      db.prepare(
        "CREATE TABLE households (id TEXT PRIMARY KEY, revision INTEGER)",
      ),
      ...modelTables.map((t) =>
        db.prepare(
          `CREATE TABLE ${t} (household_id TEXT, id TEXT, data TEXT, PRIMARY KEY(household_id, id))`,
        ),
      ),
    ]);
    await db
      .prepare("INSERT INTO households VALUES ('a', 7), ('b', 0), ('empty', 0)")
      .run();
    const expected = emptyModel();
    for (const table of modelTables) {
      for (const id of ["z", "a"]) {
        const data = { id: `${table}-${id}`, name: table };
        await db
          .prepare(`INSERT INTO ${table} VALUES (?, ?, ?)`)
          .bind("a", data.id, JSON.stringify(data))
          .run();
        (expected[table] as unknown[]).push(data);
      }
      await db
        .prepare(`INSERT INTO ${table} VALUES (?, ?, ?)`)
        .bind("b", `${table}-other`, JSON.stringify({ id: `${table}-other` }))
        .run();
    }
    // node:sqlite accepts the old SQL; workerd/D1 must reject it, proving this
    // test exercises the platform restriction that the previous suite missed.
    const flat = [
      "SELECT revision FROM households",
      ...modelTables.map((t) => `SELECT rowid FROM ${t}`),
    ].join(" UNION ALL ");
    await assert.rejects(
      db.prepare(flat).all(),
      /too many terms in compound SELECT/,
    );
    const queries: string[] = [];
    const session = db.withSession("first-primary");
    const tracked: Database = {
      prepare(sql) {
        queries.push(sql);
        return session.prepare(sql);
      },
      batch: session.batch.bind(session),
    };
    assert.deepEqual(await loadSnapshot(tracked, "a"), {
      revision: 7,
      model: expected,
    });
    assert.equal(queries.length, 1);
    assert.deepEqual(await loadSnapshot(tracked, "empty"), {
      revision: 0,
      model: emptyModel(),
    });
    await assert.rejects(
      loadSnapshot(tracked, "missing"),
      /家庭が見つかりません/,
    );
    // Exercise the reported bootstrap failure through the actual API with a
    // workerd-backed D1 session, rather than only the repository function.
    await db.batch([
      db.prepare(
        "CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT, emailVerified INTEGER, createdAt DATE, updatedAt DATE)",
      ),
      db.prepare(
        "CREATE TABLE household_members (household_id TEXT, user_id TEXT, joined_at TEXT)",
      ),
      db.prepare(
        "INSERT INTO household_members VALUES ('empty', 'preview:shared', '2026-10-07')",
      ),
    ]);
    const env: Env = {
      DB: db,
      APP_ENV: "preview",
      AUTH_MODE: "test",
      ASSETS: { fetch: async () => new Response("assets") },
      BETTER_AUTH_URL: "",
      BETTER_AUTH_SECRET: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    };
    for (let i = 0; i < 2; ++i) {
      const response = await worker.fetch(
        new Request("http://localhost/api/bootstrap"),
        env,
      );
      assert.equal(response.status, 200, await response.clone().text());
      const bootstrap = (await response.json()) as {
        revision: number;
        state: { products: unknown[] };
        authMode: string;
      };
      assert.equal(bootstrap.revision, 0);
      assert.equal(bootstrap.authMode, "test");
      assert.deepEqual(bootstrap.state.products, []);
    }
  } finally {
    await mf.dispose();
  }
});
