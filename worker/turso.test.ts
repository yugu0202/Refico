import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { connect } from "@tursodatabase/serverless";
import { testTursoServer } from "./test-turso.ts";
import { TursoDatabase, databaseBackend } from "./database.ts";
import { addUser } from "./test-db.ts";
import {
  personalSpace,
  loadSnapshot,
  saveSnapshot,
  receipt,
} from "./repository.ts";
import { emptyModel } from "../src/domain/model.ts";
import { createInvitation, acceptInvitation, manageSpace } from "./sharing.ts";
import worker from "./index.ts";
import { getAuth } from "./auth.ts";
import type { Env } from "./env.ts";

async function fixture() {
  const server = await testTursoServer();
  for (const name of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    server.sqlite.exec(
      readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  const db = new TursoDatabase(connect({ url: server.url, authToken: "test" }));
  return {
    ...server,
    db,
    async close() {
      await db.close();
      await server.close();
    },
  };
}

test("Turso実ドライバでbatchをロールバックし、招待のcascade・列・変更数を保持する", async () => {
  const f = await fixture();
  try {
    addUser(f.sqlite, "a");
    addUser(f.sqlite, "b");
    const space = await personalSpace(f.db, "a");
    const initial = emptyModel();
    await saveSnapshot(f.db, space, "a", 0, "one", "fp", initial, initial);
    assert.equal((await loadSnapshot(f.db, space)).revision, 1);
    await assert.rejects(
      saveSnapshot(f.db, space, "a", 0, "stale", "fp", initial, initial),
      /revision_conflict/,
    );
    assert.equal(await receipt(f.db, space, "stale"), null);
    await assert.rejects(
      f.db.batch([
        f.db
          .prepare(
            "INSERT INTO mutation_receipts (space_id, request_id, user_id, expected_revision, fingerprint) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(space, "bad-fk", "a", 1, "fp"),
        f.db
          .prepare("INSERT INTO units (space_id, id, data) VALUES (?, ?, ?)")
          .bind(
            space,
            "bad",
            JSON.stringify({ id: "bad", productId: "missing" }),
          ),
      ]),
      /FOREIGN KEY/,
    );
    assert.equal((await loadSnapshot(f.db, space)).revision, 1);
    assert.equal(await receipt(f.db, space, "bad-fk"), null);
    const invitation = await createInvitation(f.db, "a", space);
    await acceptInvitation(f.db, invitation.token, "b");
    assert.ok(
      f.sqlite
        .prepare("SELECT * FROM user_preferences WHERE user_id='b'")
        .get(),
    );
    await manageSpace(f.db, "b", space, { type: "leave" });
    assert.equal(
      f.sqlite
        .prepare("SELECT * FROM user_preferences WHERE user_id='b'")
        .get(),
      undefined,
    );
    assert.deepEqual(
      await f.db.prepare("SELECT name FROM user WHERE id=?").bind("a").first(),
      { name: "a" },
    );
    assert.equal(
      await f.db
        .prepare("SELECT name FROM user WHERE id=?")
        .bind("missing")
        .first(),
      null,
    );
    assert.equal(
      await f.db
        .prepare("SELECT name FROM user WHERE id=?")
        .bind("a")
        .first("name"),
      "a",
    );
    assert.equal(databaseBackend({}), "d1");
    assert.throws(
      () => databaseBackend({ DB_BACKEND: "invalid" as "d1" }),
      /DB_BACKEND/,
    );
  } finally {
    await f.close();
  }
});

test("Tursoのみのpreviewでbootstrap・保存・再送・競合を処理する", async () => {
  const f = await fixture();
  const env: Env = {
    DB_BACKEND: "turso",
    TURSO_DATABASE_URL: f.url,
    TURSO_AUTH_TOKEN: "test",
    APP_ENV: "preview",
    AUTH_MODE: "test",
    ASSETS: { fetch: async () => new Response("assets") },
    BETTER_AUTH_URL: "",
    BETTER_AUTH_SECRET: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  };
  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/bootstrap"),
      env,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const data = (await response.json()) as {
      spaceId: string;
      revision: number;
    };
    const command = (requestId: string) =>
      worker.fetch(
        new Request("http://localhost/api/commands", {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            "X-Refico-Space": data.spaceId,
          },
          body: JSON.stringify({
            requestId,
            revision: data.revision,
            command: { type: "sample.create", date: "2026-10-01" },
          }),
        }),
        env,
      );
    assert.equal(
      (await command("11111111-1111-4111-8111-111111111111")).status,
      200,
    );
    assert.equal(
      (await command("11111111-1111-4111-8111-111111111111")).status,
      200,
    );
    assert.equal(
      (await command("22222222-2222-4222-8222-222222222222")).status,
      409,
    );
    assert.equal(
      (
        await worker.fetch(new Request("http://localhost/api/bootstrap"), {
          ...env,
          TURSO_AUTH_TOKEN: undefined,
        })
      ).status,
      503,
    );
  } finally {
    await f.close();
  }
});

test("Better AuthがTursoのsessionを検証し、Cookieを更新してログアウトする", async () => {
  const f = await fixture();
  const secret = "test-secret-for-refico-at-least-thirty-two-characters";
  const env: Env = {
    DB_BACKEND: "turso",
    TURSO_DATABASE_URL: f.url,
    TURSO_AUTH_TOKEN: "test",
    APP_ENV: "staging",
    ASSETS: { fetch: async () => new Response("assets") },
    BETTER_AUTH_URL: "http://localhost:8787",
    BETTER_AUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
  };
  try {
    // Exercise insertion and timestamp conversion as used by Google sign-in.
    const context = await getAuth(env, f.db).$context;
    const inserted = await context.internalAdapter.createUser(
      {
        name: "Created",
        email: "created@example.com",
        emailVerified: true,
      },
      { method: "oauth" },
    );
    const insertedSession = await context.internalAdapter.createSession(
      inserted.id,
    );
    assert.ok(insertedSession.token);
    assert.equal(
      f.sqlite.prepare("SELECT name FROM user WHERE id=?").get(inserted.id)
        ?.name,
      "Created",
    );
    addUser(f.sqlite, "auth");
    const token = "turso-session";
    const now = new Date().toISOString();
    f.sqlite
      .prepare(
        "INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "session",
        token,
        "auth",
        new Date(Date.now() + 86400000).toISOString(),
        now,
        now,
      );
    const cookie = `better-auth.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`;
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/bootstrap", {
        headers: { cookie },
      }),
      env,
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.ok(
      response.headers
        .getSetCookie()
        .some((c) => c.startsWith("better-auth.session_data=")),
    );
    const logout = await worker.fetch(
      new Request("http://localhost:8787/api/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: env.BETTER_AUTH_URL },
      }),
      env,
    );
    assert.equal(logout.status, 200, await logout.clone().text());
    assert.equal(
      f.sqlite.prepare("SELECT * FROM session WHERE id='session'").get(),
      undefined,
    );
    assert.equal(
      (
        await worker.fetch(
          new Request("http://localhost:8787/api/bootstrap", {
            headers: { cookie },
          }),
          env,
        )
      ).status,
      401,
    );
  } finally {
    await f.close();
  }
});
