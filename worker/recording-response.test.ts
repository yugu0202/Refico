import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.ts";
import { testDatabase } from "./test-db.ts";
import type { Env } from "./env.ts";
import type { Command } from "../src/domain/commands.ts";
import {
  applyStateChanges,
  type DeltaSnapshot,
} from "../src/domain/snapshot.ts";
import { stock, type State } from "../src/domain/inventory.ts";

test("Workerの差分保存・削除・全件再送回収・競合を同じリビジョンで処理する", async () => {
  const { db, sqlite } = testDatabase();
  const env: Env = {
    APP_ENV: "preview",
    AUTH_MODE: "test",
    DB: db,
    BETTER_AUTH_URL: "http://localhost:8787",
    BETTER_AUTH_SECRET: "unused-test-secret",
    GOOGLE_CLIENT_ID: "unused",
    GOOGLE_CLIENT_SECRET: "unused",
    ASSETS: { fetch: async () => new Response("assets") },
  };
  const request = (body?: unknown, delta = false) =>
    worker.fetch(
      new Request(
        `http://localhost:8787/api/${body ? "commands" : "bootstrap"}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            ...(body
              ? {
                  "Content-Type": "application/json",
                  origin: "http://localhost:8787",
                }
              : {}),
            ...(delta ? { "X-Refico-Response": "delta-v1" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
      env,
    );
  try {
    let snapshot = (await (await request()).json()) as {
      revision: number;
      state: State;
    };
    const run = async (command: Command) => {
      const body = {
        command,
        revision: snapshot.revision,
        requestId: crypto.randomUUID(),
      };
      const response = await request(body, true);
      assert.equal(response.status, 200, await response.clone().text());
      const delta = (await response.json()) as DeltaSnapshot;
      assert.equal("state" in delta, false);
      assert.equal(delta.baseRevision, snapshot.revision);
      snapshot = {
        revision: delta.revision,
        state: applyStateChanges(snapshot.state, delta.changes),
      };
      const receipt = (await (
        await request(body, true)
      ).json()) as typeof snapshot;
      assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), receipt);
      const reloaded = (await (await request()).json()) as typeof snapshot;
      assert.deepEqual(reloaded.state, receipt.state);
      return snapshot.state;
    };
    const date = "2026-10-01";
    await run({
      type: "product.create",
      product: { id: "rice", name: "米", baseUnit: "g", units: [] },
    });
    await run({
      type: "purchase.create",
      input: { productId: "rice", quantity: 100, unit: "g", price: 101, date },
    });
    await run({
      type: "meal.create",
      input: {
        date,
        kind: "夕食",
        inputs: [{ productId: "rice", quantity: 20, unit: "g" }],
        prepared: [],
      },
    });
    const id = snapshot.state.meals[0].id;
    const rejected = await request(
      {
        command: {
          type: "purchase.delete",
          id: snapshot.state.purchases[0].id,
        },
        revision: snapshot.revision,
        requestId: crypto.randomUUID(),
      },
      true,
    );
    assert.equal(rejected.status, 422);
    assert.match(await rejected.text(), /在庫が不足/);
    assert.equal(
      ((await (await request()).json()) as typeof snapshot).revision,
      snapshot.revision,
    );
    await run({ type: "meal.delete", id });
    assert.equal(stock(snapshot.state, "rice").quantity, 100000);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM meals").get()!.n, 0);
    await run({
      type: "prepared.create",
      input: {
        date,
        name: "ご飯",
        servings: 2,
        inputs: [{ productId: "rice", quantity: 30, unit: "g" }],
      },
    });
    await run({ type: "prepared.delete", id: snapshot.state.cookings[0].id });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM batches").get()!.n,
      0,
    );
    await run({ type: "purchase.delete", id: snapshot.state.purchases[0].id });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lots").get()!.n, 0);
    const conflict = await request(
      {
        command: { type: "meal.delete", id },
        revision: 0,
        requestId: crypto.randomUUID(),
      },
      true,
    );
    assert.equal(conflict.status, 409);
    assert.equal(
      ((await (await request()).json()) as typeof snapshot).revision,
      snapshot.revision,
    );
  } finally {
    sqlite.close();
  }
});
