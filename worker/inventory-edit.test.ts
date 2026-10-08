import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.ts";
import { testDatabase } from "./test-db.ts";
import type { Env } from "./env.ts";
import type { Command } from "../src/domain/commands.ts";
import {
  stock,
  preparedRemaining,
  type State,
} from "../src/domain/inventory.ts";

test("在庫の統合編集を1リビジョンで保存し、再送・再読込と失敗時の全体保持を検証する", async () => {
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
          ...(body
            ? {
                headers: {
                  "Content-Type": "application/json",
                  origin: "http://localhost:8787",
                },
                body: JSON.stringify(body),
              }
            : {}),
        },
      ),
      env,
    );
  let snapshot: { state: State; revision: number } = await (
    await request()
  ).json();
  const date = "2026-10-08";
  const run = async (command: Command) => {
    const body = {
      requestId: crypto.randomUUID(),
      revision: snapshot.revision,
      command,
    };
    const response = await request(body);
    assert.equal(response.status, 200, await response.clone().text());
    const next = (await response.json()) as typeof snapshot;
    assert.equal(next.revision, snapshot.revision + 1);
    const replay = await request(body);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), next);
    snapshot = next;
    const reload = (await (await request()).json()) as typeof snapshot;
    assert.deepEqual(reload.state, next.state);
    assert.equal(reload.revision, next.revision);
  };
  try {
    await run({
      type: "product.create",
      product: { id: "egg", name: "卵", baseUnit: "個", units: [] },
    });
    await run({
      type: "purchase.create",
      input: { productId: "egg", quantity: 10, unit: "個", price: 300, date },
    });
    await run({
      type: "product.update",
      id: "egg",
      name: "たまご",
      units: [{ name: "パック", factor: 10 }],
      adjustment: { quantity: 8, date, reason: "廃棄" },
    });
    assert.equal(snapshot.state.products[0].name, "たまご");
    assert.equal(stock(snapshot.state, "egg").quantity, 8000);
    assert.equal(snapshot.state.adjustments!.length, 1);
    await run({
      type: "prepared.create",
      input: {
        name: "卵焼き",
        date,
        servings: 4,
        inputs: [{ productId: "egg", quantity: 4, unit: "個" }],
      },
    });
    const id = snapshot.state.cookings[0].id;
    const input = {
      name: "だし巻き",
      date,
      servings: 4,
      inputs: [{ productId: "egg", quantity: 4, unit: "個" }],
    };
    await run({
      type: "prepared.update",
      id,
      input,
      adjustment: { quantity: 3, date, reason: "廃棄" },
    });
    assert.equal(snapshot.state.cookings[0].name, "だし巻き");
    assert.equal(
      preparedRemaining(snapshot.state, snapshot.state.cookings[0]),
      3,
    );
    const before = structuredClone(snapshot);
    const failed = await request({
      requestId: crypto.randomUUID(),
      revision: snapshot.revision,
      command: {
        type: "prepared.update",
        id,
        input: { ...input, name: "保存されない名前" },
        adjustment: { quantity: 2, date: "2026-10-07", reason: "" },
      },
    });
    assert.equal(failed.status, 422);
    const reloaded = (await (await request()).json()) as typeof snapshot;
    assert.equal(reloaded.revision, before.revision);
    assert.deepEqual(reloaded.state, before.state);
  } finally {
    sqlite.close();
  }
});
