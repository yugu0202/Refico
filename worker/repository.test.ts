import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase, addUser } from "./test-db.ts";
import {
  personalSpace,
  loadSnapshot,
  saveSnapshot,
  receipt,
} from "./repository.ts";
import {
  emptyModel,
  modelTables,
  toModel,
  toView,
} from "../src/domain/model.ts";
import { applyCommand } from "../src/domain/commands.ts";

test("D1のリビジョン競合・重複送信・スペース外参照は全体をロールバックする", async () => {
  const { db, sqlite } = testDatabase();
  try {
    addUser(sqlite, "a");
    addUser(sqlite, "b");
    const a = await personalSpace(db, "a");
    const b = await personalSpace(db, "b");
    assert.equal(await personalSpace(db, "a"), a);
    const baseline = await loadSnapshot(db, a);
    const model = toModel(
      applyCommand(toView(baseline.model), {
        type: "sample.create",
        date: "2026-10-01",
      }),
    );
    await saveSnapshot(
      db,
      a,
      "a",
      0,
      "request-1",
      "fingerprint",
      model,
      baseline.model,
    );
    assert.equal((await loadSnapshot(db, a)).revision, 1);
    assert.equal((await loadSnapshot(db, b)).model.products.length, 0);
    await assert.rejects(
      saveSnapshot(
        db,
        a,
        "a",
        0,
        "request-2",
        "different",
        model,
        baseline.model,
      ),
      /revision_conflict/,
    );
    assert.equal(await receipt(db, a, "request-2"), null);
    await assert.rejects(
      saveSnapshot(db, a, "a", 1, "request-1", "fingerprint", model, model),
      /UNIQUE/,
    );
    await assert.rejects(
      saveSnapshot(db, a, "b", 1, "request-3", "fingerprint", model, model),
      /membership_required/,
    );
    assert.equal((await loadSnapshot(db, a)).revision, 1);
    const invalid = structuredClone(model);
    invalid.portions.push({
      id: "invalid",
      mealId: model.meals[0].id,
      batchId: "other-space-batch",
      quantity: 1000,
      cost: 1,
    });
    await assert.rejects(
      saveSnapshot(db, a, "a", 1, "request-4", "fingerprint", invalid, model),
      /FOREIGN KEY/,
    );
    assert.equal((await loadSnapshot(db, a)).revision, 1);
    assert.deepEqual((await loadSnapshot(db, a)).model, model);
  } finally {
    sqlite.close();
  }
});

test("snapshotは全テーブル・行順・スペース分離・空状態を保持する", async () => {
  const { db, sqlite } = testDatabase();
  try {
    addUser(sqlite, "a");
    addUser(sqlite, "b");
    const a = await personalSpace(db, "a");
    const b = await personalSpace(db, "b");
    // This repository test covers storage decoding, independently of domain
    // validation. Disable relations to put distinct sentinels in every table.
    sqlite.exec("PRAGMA foreign_keys = OFF");
    const expected = emptyModel();
    for (const t of modelTables) {
      for (const id of ["z", "a"]) {
        const data = { id: `${t}-${id}`, name: t };
        sqlite
          .prepare(`INSERT INTO ${t} (space_id, id, data) VALUES (?, ?, ?)`)
          .run(a, data.id, JSON.stringify(data));
        (expected[t] as unknown[]).push(data);
      }
      sqlite
        .prepare(`INSERT INTO ${t} (space_id, id, data) VALUES (?, ?, ?)`)
        .run(b, `${t}-other`, JSON.stringify({ id: `${t}-other` }));
    }
    sqlite.prepare("UPDATE spaces SET revision = 7 WHERE id = ?").run(a);
    assert.deepEqual(await loadSnapshot(db, a), {
      revision: 7,
      model: expected,
    });
    await assert.rejects(loadSnapshot(db, "missing"), /スペースが見つかりません/);
    addUser(sqlite, "empty");
    const empty = await personalSpace(db, "empty");
    assert.deepEqual(await loadSnapshot(db, empty), {
      revision: 0,
      model: emptyModel(),
    });
  } finally {
    sqlite.close();
  }
});
