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
    APP_ENV: "production",
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
          new Date(Date.now() + 86400000).toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
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
      sampleDataEnabled: boolean;
    };
    assert.equal(before.revision, 0);
    assert.equal(before.sampleDataEnabled, false);
    const body = {
      requestId: crypto.randomUUID(),
      revision: 0,
      command: {
        type: "product.create",
        product: { id: "rice", name: "米", baseUnit: "g", units: [] },
      },
    };
    const saved = await request("commands", "a", body);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal(((await saved.json()) as { revision: number }).revision, 1);
    assert.equal((await request("commands", "a", body)).status, 200);
    assert.equal(
      (
        await request("commands", "a", {
          ...body,
          command: {
            ...body.command,
            product: { ...body.command.product, name: "白米" },
          },
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

test("共通プレビューはURL・Cookieによらず保存を共有し、本番利用と別Originを拒否する", async () => {
  const { sqlite, db } = testDatabase();
  const env: Env = {
    DB: db,
    ASSETS: { fetch: async () => new Response("assets") },
    APP_ENV: "preview",
    AUTH_MODE: "test",
    BETTER_AUTH_URL: "",
    BETTER_AUTH_SECRET: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  };
  const request = (
    host = "branch-a.example",
    body?: unknown,
    origin = `https://${host}`,
  ) =>
    new Request(`https://${host}/api/${body ? "commands" : "bootstrap"}`, {
      method: body ? "POST" : "GET",
      headers: {
        cookie: "unrelated=value",
        "Cf-Access-Authenticated-User-Email": "ignored@example.test",
        ...(body ? { origin, "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    const baseline = (await response.json()) as {
      authMode: string;
      sampleDataEnabled: boolean;
      householdId: string;
      revision: number;
    };
    assert.equal(baseline.authMode, "test");
    assert.equal(baseline.sampleDataEnabled, true);
    assert.equal(baseline.householdId, "personal:preview:shared");
    const body = {
      requestId: crypto.randomUUID(),
      revision: 0,
      command: { type: "sample.create", date: "2026-10-01" },
    };
    assert.equal(
      (
        await worker.fetch(
          request("branch-a.example", body, "https://evil.example"),
          env,
        )
      ).status,
      403,
    );
    assert.equal(
      (await worker.fetch(request("branch-a.example", body), env)).status,
      200,
    );
    const saved = (await (
      await worker.fetch(
        new Request("https://branch-b.example/api/bootstrap"),
        env,
      )
    ).json()) as {
      householdId: string;
      revision: number;
      state: { products: unknown[] };
    };
    assert.equal(saved.householdId, baseline.householdId);
    assert.equal(saved.revision, 1);
    assert.ok(saved.state.products.length > 0);
    assert.equal(
      sqlite.prepare("SELECT count(*) AS count FROM user").get()?.count,
      1,
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) AS count FROM households").get()?.count,
      1,
    );
    assert.equal(
      (
        await worker.fetch(
          request("branch-b.example", {
            ...body,
            requestId: crypto.randomUUID(),
          }),
          env,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await worker.fetch(
          new Request("https://branch-a.example/api/auth/sign-out", {
            method: "POST",
          }),
          env,
        )
      ).status,
      404,
    );
    for (const appEnv of ["production", undefined] as const) {
      assert.equal(
        (await worker.fetch(request(), { ...env, APP_ENV: appEnv })).status,
        503,
      );
    }
    assert.equal(
      (
        await worker.fetch(request(), {
          ...env,
          AUTH_MODE: "google",
          APP_ENV: "production",
        })
      ).status,
      503,
    );
  } finally {
    sqlite.close();
  }
});

test("認証CookieはD1参照を省き、期限切れと改ざんを再検証し、APIエラーでも更新される", async (t) => {
  const { sqlite, db, queries } = testDatabase();
  const start = Date.now();
  let now = start;
  t.mock.method(Date, "now", () => now);
  const secret = "test-secret-for-refico-at-least-thirty-two-characters";
  const env: Env = {
    APP_ENV: "production",
    DB: db,
    ASSETS: { fetch: async () => new Response("assets") },
    BETTER_AUTH_URL: "http://localhost:8787",
    BETTER_AUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
  };
  const token = "cached-token";
  const tokenCookie = `better-auth.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`;
  const request = (cookie: string, invalidCommand = false) =>
    worker.fetch(
      new Request(
        `http://localhost:8787/api/${invalidCommand ? "commands" : "bootstrap"}`,
        {
          headers: {
            cookie,
            ...(invalidCommand
              ? {
                  origin: env.BETTER_AUTH_URL,
                  "Content-Type": "application/json",
                }
              : {}),
          },
          ...(invalidCommand ? { method: "POST", body: "{}" } : {}),
        },
      ),
      env,
    );
  const cacheCookie = (response: Response) => {
    const cookies = response.headers.getSetCookie();
    const cache = cookies
      .filter((c) => c.startsWith("better-auth.session_data="))
      .at(-1);
    assert.ok(cache, "API response must forward the refreshed cache cookie");
    assert.match(cache, /Max-Age=300/);
    return cache.split(";")[0];
  };
  const authReads = () =>
    queries.filter(
      (sql) => /^select\b/i.test(sql) && /\b(?:session|user)\b/.test(sql),
    );
  try {
    addUser(sqlite, "cached");
    sqlite
      .prepare(
        "INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "cached-session",
        token,
        "cached",
        new Date(start + 86400000).toISOString(),
        new Date(start).toISOString(),
        new Date(start).toISOString(),
      );
    const first = await request(tokenCookie);
    assert.equal(first.status, 200);
    const cached = `${tokenCookie}; ${cacheCookie(first)}`;
    assert.ok(authReads().length > 0);
    queries.length = 0;
    assert.equal((await request(cached)).status, 200);
    assert.equal(authReads().length, 0);
    // Force expiry without waiting five minutes. Even validation errors must
    // propagate the refreshed cookie so the following request can use it.
    now = start + 301000;
    queries.length = 0;
    const expired = await request(cached, true);
    assert.equal(expired.status, 400);
    assert.ok(authReads().length > 0);
    const renewed = `${tokenCookie}; ${cacheCookie(expired)}`;
    queries.length = 0;
    assert.equal((await request(renewed)).status, 200);
    assert.equal(authReads().length, 0);
    sqlite.prepare("DELETE FROM session WHERE id = ?").run("cached-session");
    // A revoked session can survive only until the configured cache expiry.
    assert.equal((await request(renewed)).status, 200);
    const payload = JSON.parse(
      Buffer.from(cacheCookie(expired).split("=")[1], "base64url").toString(),
    );
    payload.session.user.name = "forged";
    const damaged = `${tokenCookie}; better-auth.session_data=${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
    assert.equal((await request(damaged)).status, 401);
    now = start + 602000;
    assert.equal((await request(renewed)).status, 401);
  } finally {
    t.mock.restoreAll();
    sqlite.close();
  }
});
