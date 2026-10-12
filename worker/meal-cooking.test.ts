import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import worker from "./index.ts";
import { testDatabase } from "./test-db.ts";
import { testTursoServer } from "./test-turso.ts";
import type { Env } from "./env.ts";
import {
  mealCost,
  stock,
  preparedRemaining,
  type State,
} from "../src/domain/inventory.ts";
import type { Command } from "../src/domain/commands.ts";

for (const backend of ["d1", "turso"] as const) {
  test(`${backend}: 食事入力中の料理化を一括保存し、失敗時の全体取消・再送・競合を処理する`, async () => {
    const d1 = backend === "d1" ? testDatabase() : undefined;
    const turso = backend === "turso" ? await testTursoServer() : undefined;
    const sqlite = (d1 ?? turso)!.sqlite;
    if (turso)
      for (const name of readdirSync(new URL("../migrations/", import.meta.url))
        .filter((n) => n.endsWith(".sql"))
        .sort())
        sqlite.exec(
          readFileSync(
            new URL(`../migrations/${name}`, import.meta.url),
            "utf8",
          ),
        );
    const env: Env = {
      APP_ENV: "preview",
      AUTH_MODE: "test",
      DB_BACKEND: backend,
      ...(d1
        ? { DB: d1.db }
        : { TURSO_DATABASE_URL: turso!.url, TURSO_AUTH_TOKEN: "test" }),
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
    let revision = 0;
    const save = async (command: Command) => {
      const response = await request({
        requestId: crypto.randomUUID(),
        revision,
        command,
      });
      assert.equal(response.status, 200, await response.clone().text());
      const snapshot = (await response.json()) as {
        state: State;
        revision: number;
      };
      revision = snapshot.revision;
      return snapshot.state;
    };
    const date = "2026-10-08";
    try {
      assert.equal((await request()).status, 200);
      await save({
        type: "product.create",
        product: { id: "rice", name: "米", baseUnit: "g", units: [] },
      });
      await save({
        type: "purchase.create",
        input: {
          productId: "rice",
          quantity: 1000,
          unit: "g",
          price: 1000,
          date,
        },
      });
      const input = {
        date,
        kind: "夕食" as const,
        inputs: [{ productId: "rice", quantity: 50, unit: "g" }],
        prepared: [],
        direct: { cost: 650, place: "売店", note: "弁当" },
      };
      const command = {
        type: "meal.create-with-cookings" as const,
        input,
        cookings: [
          {
            name: "ご飯",
            servings: 4,
            eatenServings: 1,
            inputs: [{ productId: "rice", quantity: 400, unit: "g" }],
          },
        ],
      };
      const loaded = await (await request()).json();
      // Cooking succeeds in memory, but the rest of the meal has insufficient stock.
      const invalid = await request({
        requestId: crypto.randomUUID(),
        revision,
        command: {
          ...command,
          input: {
            ...input,
            inputs: [{ productId: "rice", quantity: 700, unit: "g" }],
          },
        },
      });
      assert.equal(invalid.status, 422);
      assert.deepEqual(await (await request()).json(), loaded);
      // Force a late persistence failure after the receipt and cooking inserts.
      sqlite.exec(`CREATE TRIGGER reject_meal_cooking_test BEFORE INSERT ON meals
        BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END;`);
      const body = { requestId: crypto.randomUUID(), revision, command };
      assert.equal((await request(body)).status, 500);
      assert.deepEqual(await (await request()).json(), loaded);
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM cookings").get()!.n,
        0,
      );
      sqlite.exec("DROP TRIGGER reject_meal_cooking_test");
      const response = await request(body);
      assert.equal(response.status, 200, await response.clone().text());
      const saved = (await response.json()) as {
        state: State;
        revision: number;
      };
      assert.equal(saved.revision, revision + 1);
      assert.equal((await request(body)).status, 200);
      const state = saved.state;
      assert.deepEqual(await (await request()).json(), {
        ...(loaded as object),
        ...saved,
      });
      assert.equal(state.cookings.length, 1);
      assert.equal(state.meals.length, 1);
      assert.equal(mealCost(state.meals[0]), 800);
      assert.equal(stock(state, "rice").quantity, 550000);
      assert.equal(preparedRemaining(state, state.cookings[0]), 3);
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM portions").get()!.n,
        1,
      );
      assert.equal(
        sqlite
          .prepare(
            "SELECT COUNT(*) AS n FROM mutation_receipts WHERE request_id = ?",
          )
          .get(body.requestId)!.n,
        1,
      );
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM allocations").get()!.n,
        2,
      );
      const conflict = await request({
        ...body,
        requestId: crypto.randomUUID(),
      });
      assert.equal(conflict.status, 409);
      assert.deepEqual(await (await request()).json(), {
        ...(loaded as object),
        ...saved,
      });
    } finally {
      if (turso) await turso.close();
      else sqlite.close();
    }
  });
}
