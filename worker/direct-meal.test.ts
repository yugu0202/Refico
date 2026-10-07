import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.ts";
import { testDatabase } from "./test-db.ts";
import type { Env } from "./env.ts";
import type { State } from "../src/domain/inventory.ts";

test("外食のAPI保存・再送・編集・再読込と入力拒否をD1で確認する", async () => {
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
  try {
    assert.equal((await request()).status, 200);
    const input = {
      source: "direct",
      date: "2026-10-07",
      kind: "昼食",
      cost: 1280,
      place: "食堂",
      note: "弁当",
    };
    const body = {
      requestId: crypto.randomUUID(),
      revision: 0,
      command: { type: "meal.create", input },
    };
    const saved = await request(body);
    assert.equal(saved.status, 200, await saved.clone().text());
    const snapshot = (await saved.json()) as { state: State; revision: number };
    assert.equal(snapshot.revision, 1);
    assert.equal((await request(body)).status, 200);
    assert.equal(
      ((await (await request()).json()) as { state: State }).state.meals.length,
      1,
    );
    const invalid = await request({
      ...body,
      requestId: crypto.randomUUID(),
      revision: 1,
      command: { type: "meal.create", input: { ...input, cost: -1 } },
    });
    assert.equal(invalid.status, 400);
    const edited = await request({
      requestId: crypto.randomUUID(),
      revision: 1,
      command: {
        type: "meal.update",
        id: snapshot.state.meals[0].id,
        input: { ...input, cost: 0, note: "招待" },
      },
    });
    assert.equal(edited.status, 200, await edited.clone().text());
    const reloaded = (await (await request()).json()) as {
      state: State;
      revision: number;
    };
    assert.equal(reloaded.revision, 2);
    assert.deepEqual(reloaded.state.meals[0].direct, {
      cost: 0,
      place: "食堂",
      note: "招待",
    });
    assert.deepEqual(reloaded.state.purchases, []);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM allocations").get()!.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
