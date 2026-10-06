import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase, addUser } from "./test-db.ts";
import {
  personalHousehold,
  loadSnapshot,
  saveSnapshot,
  receipt,
} from "./repository.ts";
import { toModel, toView } from "../src/domain/model.ts";
import { applyCommand } from "../src/domain/commands.ts";

test("D1のリビジョン競合・重複送信・家庭外参照は全体をロールバックする", async () => {
  const { db, sqlite } = testDatabase();
  try {
    addUser(sqlite, "a");
    addUser(sqlite, "b");
    const a = await personalHousehold(db, "a");
    const b = await personalHousehold(db, "b");
    assert.equal(await personalHousehold(db, "a"), a);
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
      batchId: "other-household-batch",
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
