import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { testDatabase, addUser } from "./test-db.ts";
import worker from "./index.ts";
import type { Env } from "./env.ts";

test("認証済みAPIは所有者を分離し、再送・古い更新・偽造入力を扱う", async () => {
  const { sqlite, db } = testDatabase();
  const secret = "test-secret-for-refico-at-least-thirty-two-characters";
  const env: Env = {
    DB: db,
    ASSETS: { fetch: async () => new Response("assets") },
    BETTER_AUTH_URL: "http://localhost:8787",
    BETTER_AUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
  };
  function cookie(id: string) {
    const token = `token-${id}`;
    return `better-auth.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`;
  }
  function request(
    path: string,
    id?: string,
    body?: unknown,
    origin = "http://localhost:8787",
  ) {
    return worker.fetch(
      new Request(`http://localhost:8787/api/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(id ? { cookie: cookie(id) } : {}),
          ...(body ? { "Content-Type": "application/json", origin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  }
  try {
    for (const id of ["a", "b"]) {
      addUser(sqlite, id);
      sqlite
        .prepare(
          "INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          `session-${id}`,
          `token-${id}`,
          id,
          Date.now() + 86400000,
          Date.now(),
          Date.now(),
        );
    }
    assert.equal((await request("bootstrap")).status, 401);
    assert.equal(
      (await request("commands", "a", { bad: true }, "https://evil.example"))
        .status,
      403,
    );
    const before = (await (await request("bootstrap", "a")).json()) as {
      revision: number;
    };
    assert.equal(before.revision, 0);
    const body = {
      requestId: crypto.randomUUID(),
      revision: 0,
      command: { type: "sample.create", date: "2026-10-01" },
    };
    const saved = await request("commands", "a", body);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal(((await saved.json()) as { revision: number }).revision, 1);
    assert.equal((await request("commands", "a", body)).status, 200);
    assert.equal(
      (
        await request("commands", "a", {
          ...body,
          command: { type: "sample.create", date: "2026-10-02" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("commands", "a", {
          ...body,
          requestId: crypto.randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("commands", "a", {
          ...body,
          revision: 1,
          command: { ...body.command, householdId: "personal:b" },
        })
      ).status,
      400,
    );
    const other = (await (await request("bootstrap", "b")).json()) as {
      revision: number;
      state: { products: unknown[] };
    };
    assert.equal(other.revision, 0);
    assert.equal(other.state.products.length, 0);
    const current = (await (await request("bootstrap", "a")).json()) as {
      revision: number;
    };
    assert.equal(current.revision, 1);
  } finally {
    sqlite.close();
  }
});

test("AccessプレビューはGoogle設定なしで認証し、偽造ヘッダー・認証なし・本番利用を拒否する", async () => {
  const { sqlite, db } = testDatabase();
  const env: Env = {
    DB: db,
    ASSETS: { fetch: async () => new Response("assets") },
    APP_ENV: "preview",
    AUTH_MODE: "access",
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "preview-policy",
    BETTER_AUTH_URL: "",
    BETTER_AUTH_SECRET: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  };
  const identity = (id: string) => ({
    access: {
      aud: "preview-policy",
      getIdentity: async () => ({
        user_uuid: id,
        email: `${id}@example.test`,
        name: id,
      }),
    },
  });
  const request = (body?: unknown, origin = "https://feature.refico.example") =>
    new Request(
      "https://feature.refico.example/api/" + (body ? "commands" : "bootstrap"),
      {
        method: body ? "POST" : "GET",
        headers: {
          "Cf-Access-Jwt-Assertion": "forged",
          "Cf-Access-Authenticated-User-Email": "forged@example.test",
          ...(body ? { origin, "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  try {
    assert.equal((await worker.fetch(request(), env)).status, 401);
    assert.equal(
      (
        await worker.fetch(request(), env, {
          access: { aud: "preview", getIdentity: async () => undefined },
        })
      ).status,
      401,
    );
    const response = await worker.fetch(request(), env, identity("a"));
    assert.equal(response.status, 200);
    const baseline = (await response.json()) as {
      authMode: string;
      revision: number;
      householdId: string;
    };
    assert.equal(baseline.authMode, "access");
    assert.equal(baseline.householdId, "personal:access:a");
    const body = {
      requestId: crypto.randomUUID(),
      revision: 0,
      command: { type: "sample.create", date: "2026-10-01" },
    };
    assert.equal(
      (
        await worker.fetch(
          request(body, "https://evil.example"),
          env,
          identity("a"),
        )
      ).status,
      403,
    );
    assert.equal(
      (await worker.fetch(request(body), env, identity("a"))).status,
      200,
    );
    const other = (await (
      await worker.fetch(request(), env, identity("b"))
    ).json()) as { state: { products: unknown[] } };
    assert.equal(other.state.products.length, 0);
    assert.equal(
      (
        await worker.fetch(
          request(),
          { ...env, APP_ENV: "production" },
          identity("a"),
        )
      ).status,
      503,
    );
    const google = {
      ...env,
      AUTH_MODE: "google" as const,
      APP_ENV: "production" as const,
    };
    assert.equal(
      (await worker.fetch(request(), google, identity("a"))).status,
      503,
    );
  } finally {
    sqlite.close();
  }
});
