import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { emptyModel, modelTables } from "../src/domain/model.ts";
import { loadSnapshot } from "./repository.ts";
import type { D1Database, Env } from "./env.ts";
import worker from "./index.ts";

test("D1ランタイムでsnapshotの一括取得とpreviewのbootstrapが成功する", async () => {
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
        "CREATE TABLE spaces (id TEXT PRIMARY KEY, revision INTEGER, name TEXT)",
      ),
      ...modelTables.map((t) =>
        db.prepare(
          `CREATE TABLE ${t} (space_id TEXT, id TEXT, data TEXT, PRIMARY KEY(space_id, id))`,
        ),
      ),
    ]);
    await db
      .prepare(
        "INSERT INTO spaces VALUES ('a', 7, 'A'), ('b', 0, 'B'), ('empty', 0, 'Empty')",
      )
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
    const session = db.withSession("first-primary");
    assert.deepEqual(await loadSnapshot(session, "a"), {
      revision: 7,
      model: expected,
    });
    assert.deepEqual(await loadSnapshot(session, "empty"), {
      revision: 0,
      model: emptyModel(),
    });
    await assert.rejects(
      loadSnapshot(session, "missing"),
      /スペースが見つかりません/,
    );
    // Exercise the reported bootstrap failure through the actual API with a
    // workerd-backed D1 session, rather than only the repository function.
    await db.batch([
      db.prepare(
        "CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT, emailVerified INTEGER, createdAt DATE, updatedAt DATE)",
      ),
      db.prepare(
        "CREATE TABLE space_members (space_id TEXT, user_id TEXT, joined_at TEXT, role TEXT)",
      ),
      db.prepare(
        "INSERT INTO space_members VALUES ('empty', 'preview:shared', '2026-10-07', 'owner')",
      ),
    ]);
    await db
      .prepare(
        "CREATE TABLE user_preferences (user_id TEXT, active_space_id TEXT)",
      )
      .run();
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
