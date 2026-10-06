import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { testDatabase, addUser } from "./test-db.ts";
import worker from "./index.ts";
import type { Env } from "./env.ts";

for (const [appEnv, enabled] of [
  ["production", false],
  [undefined, false],
  ["unknown", false],
  ["preview", true],
  ["development", true],
] as const) {
  test(`サンプル追加の環境制限: ${appEnv ?? "未設定"}`, async () => {
    const { sqlite, db } = testDatabase();
    const secret = "test-secret-for-refico-at-least-thirty-two-characters";
    const env: Env = {
      APP_ENV: appEnv as Env["APP_ENV"],
      AUTH_MODE: "google",
      DB: db,
      ASSETS: { fetch: async () => new Response("assets") },
      BETTER_AUTH_URL: "http://localhost:8787",
      BETTER_AUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
    };
    const token = "sample-policy-token";
    const signature = createHmac("sha256", secret)
      .update(token)
      .digest("base64");
    const cookie = `better-auth.session_token=${encodeURIComponent(token + "." + signature)}`;
    const body = {
      requestId: crypto.randomUUID(),
      revision: 0,
      command: { type: "sample.create", date: "2026-10-01" },
    };
    const request = (mutation = false) =>
      new Request(
        `http://localhost:8787/api/${mutation ? "commands" : "bootstrap"}`,
        {
          method: mutation ? "POST" : "GET",
          headers: {
            cookie,
            ...(mutation
              ? {
                  origin: "http://localhost:8787",
                  "Content-Type": "application/json",
                }
              : {}),
          },
          ...(mutation ? { body: JSON.stringify(body) } : {}),
        },
      );
    try {
      addUser(sqlite, "sample-user");
      sqlite
        .prepare(
          "INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "sample-session",
          token,
          "sample-user",
          Date.now() + 86400000,
          Date.now(),
          Date.now(),
        );
      const before = await worker.fetch(request(), env);
      assert.equal(before.status, 200);
      const baseline = await before.json();
      assert.equal(baseline.sampleDataEnabled, enabled);
      const result = await worker.fetch(request(true), env);
      assert.equal(
        result.status,
        enabled ? 200 : 403,
        await result.clone().text(),
      );
      const after = await (await worker.fetch(request(), env)).json();
      if (enabled) {
        assert.equal(after.revision, 1);
        assert.ok(after.state.products.length > 0);
        // A receipt from an allowed environment must not bypass production policy.
        assert.equal(
          (await worker.fetch(request(true), { ...env, APP_ENV: "production" }))
            .status,
          403,
        );
      } else {
        assert.deepEqual(after, baseline);
      }
    } finally {
      sqlite.close();
    }
  });
}
