import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { emptyModel, modelTables, toModel } from "../src/domain/model.ts";
import { sampleState } from "../src/domain/sample.ts";
import { testDatabase } from "./test-db.ts";
import {
  personalSpace,
  loadSnapshot,
  receipt,
  saveSnapshot,
  type Database,
} from "./repository.ts";

const legacyMigrations = ["0001_auth.sql", "0002_inventory.sql"];
function migrationStatements(name: string) {
  // Keep trigger bodies together; all other statements end at a semicolon.
  const sql = readFileSync(
    new URL(`../migrations/${name}`, import.meta.url),
    "utf8",
  ).replace(/^--.*$/gm, "");
  return sql.match(/\s*CREATE TRIGGER[\s\S]*?\bEND;|[^;]+;/g) ?? [];
}
async function migrate(db: Database, name: string) {
  await db.batch(migrationStatements(name).map((sql) => db.prepare(sql)));
}

async function verifyUpgrade(db: Database) {
  const id = "personal:a";
  const other = "personal:b";
  const model = toModel(sampleState("2026-10-01"));
  // Include storage rows in every table, even ones absent from the sample.
  // These sentinels check preservation of JSON and row order, not domain data.
  for (const table of modelTables) {
    if (!model[table].length)
      (model[table] as unknown[]).push({ id: `${table}-sentinel` });
  }
  await db.batch([
    ...["a", "b"].map((user) =>
      db
        .prepare(
          "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, '2026-10-01', '2026-10-01')",
        )
        .bind(user, user, `${user}@example.com`),
    ),
    db
      .prepare(
        "INSERT INTO households (id, owner_user_id, name) VALUES (?, 'a', '共有の在庫'), (?, 'b', '自分の在庫')",
      )
      .bind(id, other),
    db
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, 'a', 'owner', '2026-10-01'), (?, 'b', 'owner', '2026-10-01'), (?, 'b', 'member', '2026-10-02')",
      )
      .bind(id, other, id),
    db
      .prepare(
        "INSERT INTO mutation_receipts (household_id, request_id, user_id, expected_revision, fingerprint) VALUES (?, 'before-rename', 'a', 0, 'original')",
      )
      .bind(id),
    ...modelTables.flatMap((table) =>
      model[table].map((row) =>
        db
          .prepare(
            `INSERT INTO ${table} (household_id, id, data) VALUES (?, ?, ?)`,
          )
          .bind(id, row.id, JSON.stringify(row)),
      ),
    ),
  ]);
  const before = await db.batch(
    modelTables.map((table) =>
      db.prepare(
        `SELECT rowid, household_id AS space_id, * FROM ${table} ORDER BY rowid`,
      ),
    ),
  );
  await migrate(db, "0003_spaces.sql");

  assert.equal(await personalSpace(db, "a"), id);
  assert.equal(await personalSpace(db, "b"), other);
  assert.deepEqual(await loadSnapshot(db, id), { model, revision: 1 });
  assert.deepEqual(await loadSnapshot(db, other), {
    model: emptyModel(),
    revision: 0,
  });
  assert.equal(
    (await receipt(db, id, "before-rename"))?.fingerprint,
    "original",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT name FROM spaces WHERE id = ?")
        .bind(id)
        .first<{ name: string }>()
    )?.name,
    "共有の在庫",
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM space_members WHERE user_id = 'b'",
        )
        .first<{ count: number }>()
    )?.count,
    2,
  );
  for (const [index, table] of modelTables.entries()) {
    const after = await db
      .prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
      .all();
    assert.deepEqual(
      after.results.map((row) => ({ ...row })),
      before[index].results.map((value) => {
        const { household_id: _old, ...row } = value as Record<string, unknown>;
        return row;
      }),
    );
  }
  assert.deepEqual(
    (await db.prepare("PRAGMA foreign_key_check").all()).results,
    [],
  );
  assert.deepEqual(
    (
      await db
        .prepare("SELECT name FROM sqlite_master WHERE sql LIKE '%household%'")
        .all()
    ).results,
    [],
  );

  // Renamed triggers must still enforce membership, revision and replay guards.
  await assert.rejects(
    saveSnapshot(
      db,
      other,
      "a",
      0,
      "unauthorized",
      "new",
      emptyModel(),
      emptyModel(),
    ),
    /membership_required/,
  );
  await assert.rejects(
    saveSnapshot(db, id, "a", 0, "stale", "new", model, model),
    /revision_conflict/,
  );
  await assert.rejects(
    saveSnapshot(db, id, "a", 1, "before-rename", "original", model, model),
    /UNIQUE/,
  );
  assert.equal(await receipt(db, id, "stale"), null);
  const changed = structuredClone(model);
  changed.products[0].name = "変更後";
  await saveSnapshot(db, id, "b", 1, "after-rename", "new", changed, model);
  assert.deepEqual(await loadSnapshot(db, id), { model: changed, revision: 2 });
  assert.equal((await loadSnapshot(db, other)).revision, 0);
}

test("既存DBのスペース移行で全記録・所属・行順・制約・再送を保持する", async () => {
  const { db, sqlite } = testDatabase({ migrations: legacyMigrations });
  try {
    await verifyUpgrade(db);
  } finally {
    sqlite.close();
  }
});

test("D1ランタイムでも既存データのスペース移行と更新が成功する", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      name: "space-migration-test",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      compatibilityDate: "2026-10-06",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = (await mf.getD1Database("DB")) as unknown as Database;
    for (const name of legacyMigrations) await migrate(db, name);
    await verifyUpgrade(db);
  } finally {
    await mf.dispose();
  }
});
