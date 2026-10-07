import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.ts";
import { testDatabase } from "./test-db.ts";
import type { Env } from "./env.ts";
import type { Command } from "../src/domain/commands.ts";
import {
  dailyCosts,
  preparedBalance,
  type State,
} from "../src/domain/inventory.ts";

test("D1で作り置きと食事を独立保存し、再送・失敗・編集・再読込を保持する", async () => {
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
  const request = (body?: unknown) =>
    worker.fetch(
      new Request(
        `http://localhost:8787/api/${body ? "commands" : "bootstrap"}`,
        {
          method: body ? "POST" : "GET",
          headers: body
            ? {
                "Content-Type": "application/json",
                origin: "http://localhost:8787",
              }
            : {},
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
      env,
    );
  let snapshot: { state: State; revision: number };
  const run = async (command: Command) => {
    const body = {
      command,
      requestId: crypto.randomUUID(),
      revision: snapshot.revision,
    };
    const response = await request(body);
    assert.equal(response.status, 200, await response.clone().text());
    snapshot = (await response.json()) as typeof snapshot;
    assert.equal((await request(body)).status, 200);
    return snapshot.state;
  };
  const date = "2026-10-07";
  try {
    snapshot = (await (await request()).json()) as typeof snapshot;
    await run({
      type: "product.create",
      product: { id: "rice", name: "米", baseUnit: "g", units: [] },
    });
    await run({
      type: "purchase.create",
      input: {
        productId: "rice",
        quantity: 1000,
        unit: "g",
        price: 1000,
        date,
      },
    });
    let state = await run({
      type: "prepared.create",
      input: {
        date,
        name: "冷凍ご飯",
        servings: 4,
        inputs: [{ productId: "rice", quantity: 400, unit: "g" }],
      },
    });
    const cooking = state.cookings[0];
    assert.equal(state.meals.length, 0);
    assert.deepEqual(dailyCosts(state), []);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM meals").get()!.n, 0);
    state = await run({
      type: "meal.create",
      input: {
        date,
        kind: "夕食",
        inputs: [{ productId: "rice", quantity: 50, unit: "g" }],
        prepared: [{ batchId: cooking.id, quantity: 1 }],
      },
    });
    assert.deepEqual(dailyCosts(state), [[date, 150]]);
    const before = structuredClone(snapshot);
    const failed = await request({
      requestId: crypto.randomUUID(),
      revision: snapshot.revision,
      command: {
        type: "prepared.update",
        id: cooking.id,
        input: {
          date,
          name: "冷凍ご飯",
          servings: 0.5,
          inputs: cooking.usages.map(({ productId, quantity, unit }) => ({
            productId,
            quantity,
            unit,
          })),
        },
      },
    });
    assert.equal(failed.status, 422);
    const afterFailure = (await (await request()).json()) as typeof snapshot;
    assert.equal(afterFailure.revision, before.revision);
    assert.deepEqual(afterFailure.state, before.state);
    state = await run({
      type: "prepared.update",
      id: cooking.id,
      input: {
        date,
        name: "冷凍ご飯",
        servings: 5,
        inputs: [{ productId: "rice", quantity: 400, unit: "g" }],
      },
    });
    assert.deepEqual(dailyCosts(state), [[date, 130]]);
    const reloaded = (await (await request()).json()) as typeof snapshot;
    assert.equal(reloaded.revision, snapshot.revision);
    assert.deepEqual(reloaded.state, state);
    assert.deepEqual(preparedBalance(state, state.cookings[0]), {
      quantity: 4000,
      value: 320,
    });
  } finally {
    sqlite.close();
  }
});
