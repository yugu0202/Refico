import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase, addUser } from "./test-db.ts";
import { personalSpace, loadSnapshot, saveSnapshot } from "./repository.ts";
import {
  activeSpace,
  resolveSpace,
  createInvitation,
  acceptInvitation,
  invitationInfo,
  listSpaces,
  manageSpace,
  switchSpace,
  tokenHash,
} from "./sharing.ts";
import { emptyModel } from "../src/domain/model.ts";
import worker from "./index.ts";
import type { Env } from "./env.ts";

test("スペース解決は所属を確認し、初回だけ作成し、未所属の選択は個人へ戻す", async () => {
  const { db, sqlite, queries } = testDatabase();
  try {
    for (const id of ["a", "b", "c"]) addUser(sqlite, id);
    const a = await resolveSpace(db, "a");
    queries.length = 0;
    assert.equal(await resolveSpace(db, "a"), a);
    assert.equal(queries.length, 1);
    const b = await resolveSpace(db, "b");
    const invite = await createInvitation(db, "a", a);
    await acceptInvitation(db, invite.token, "b");
    assert.equal(await resolveSpace(db, "b"), a);
    const hash = await tokenHash(invite.token);
    await assert.rejects(
      manageSpace(db, "b", a, { type: "revoke", invitationId: hash }),
      /オーナー/,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT revoked_at FROM space_invitations WHERE token_hash = ?",
        )
        .get(hash)?.revoked_at,
      null,
    );
    await assert.rejects(
      manageSpace(db, "c", a, { type: "revoke", invitationId: hash }),
      /オーナー/,
    );
    await manageSpace(db, "a", a, { type: "remove", userId: "b" });
    assert.equal(await resolveSpace(db, "b"), b);
    sqlite
      .prepare(
        "UPDATE user_preferences SET active_space_id = ? WHERE user_id = ?",
      )
      .run(a, "b");
    assert.equal(await resolveSpace(db, "b"), b);
    const live = await createInvitation(db, "a", a);
    const liveId = await tokenHash(live.token);
    await manageSpace(db, "a", a, { type: "revoke", invitationId: liveId });
    await manageSpace(db, "a", a, { type: "revoke", invitationId: liveId });
    await assert.rejects(invitationInfo(db, live.token, "c"), /利用できません/);
  } finally {
    sqlite.close();
  }
});

test("招待は単一利用・既存記録保持・現在スペース切替、退出は記録を消さない", async () => {
  const { db, sqlite } = testDatabase();
  try {
    for (const id of ["a", "b", "c"]) addUser(sqlite, id);
    const a = await personalSpace(db, "a");
    const b = await personalSpace(db, "b");
    await saveSnapshot(db, b, "b", 0, "old", "old", emptyModel(), emptyModel());
    const invite = await createInvitation(db, "a", a);
    assert.equal(invite.token.length, 64);
    assert.equal(
      sqlite.prepare("SELECT token_hash FROM space_invitations").get()
        ?.token_hash,
      await tokenHash(invite.token),
    );
    assert.equal(
      (await invitationInfo(db, invite.token, "b")).name,
      "マイスペース",
    );
    await acceptInvitation(db, invite.token, "a");
    assert.equal(
      (await invitationInfo(db, invite.token, "b")).acceptedBy,
      null,
    );
    await acceptInvitation(db, invite.token, "b");
    assert.equal(await activeSpace(db, "b", b), a);
    assert.equal((await listSpaces(db, "b")).length, 2);
    assert.equal((await loadSnapshot(db, b)).revision, 1);
    await acceptInvitation(db, invite.token, "b"); // Lost response retry is safe.
    await assert.rejects(acceptInvitation(db, invite.token, "c"), /利用できません/);
    await assert.rejects(createInvitation(db, "b", a), /オーナー/);
    await assert.rejects(switchSpace(db, "c", a), /所属/);
    await assert.rejects(
      manageSpace(db, "a", a, { type: "leave" }),
      /オーナー/,
    );
    await manageSpace(db, "b", a, { type: "leave" });
    assert.equal(await activeSpace(db, "b", b), b);
    assert.equal((await loadSnapshot(db, a)).revision, 0);
    assert.equal((await loadSnapshot(db, b)).revision, 1);
  } finally {
    sqlite.close();
  }
});

test("期限切れ・無効化・メンバー削除後の招待と更新を拒否する", async () => {
  const { db, sqlite } = testDatabase();
  try {
    for (const id of ["a", "b", "c"]) addUser(sqlite, id);
    const a = await personalSpace(db, "a");
    const b = await personalSpace(db, "b");
    const expired = await createInvitation(db, "a", a);
    sqlite.prepare("UPDATE space_invitations SET expires_at=0").run();
    await assert.rejects(acceptInvitation(db, expired.token, "b"), /利用できません/);
    const revoked = await createInvitation(db, "a", a);
    await manageSpace(db, "a", a, {
      type: "revoke",
      invitationId: await tokenHash(revoked.token),
    });
    await assert.rejects(acceptInvitation(db, revoked.token, "b"), /利用できません/);
    const invite = await createInvitation(db, "a", a);
    await Promise.allSettled([
      acceptInvitation(db, invite.token, "b"),
      acceptInvitation(db, invite.token, "c"),
    ]);
    assert.equal(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM space_members WHERE space_id=? AND role='member'",
        )
        .get(a)?.n,
      1,
    );
    const accepted = sqlite
      .prepare("SELECT accepted_by FROM space_invitations WHERE token_hash=?")
      .get(await tokenHash(invite.token))?.accepted_by as string;
    await manageSpace(db, "a", a, { type: "remove", userId: accepted });
    await assert.rejects(switchSpace(db, accepted, a), /所属/);
    await assert.rejects(
      saveSnapshot(
        db,
        a,
        accepted,
        0,
        "removed",
        "x",
        emptyModel(),
        emptyModel(),
      ),
      /membership_required/,
    );
    assert.equal(await activeSpace(db, "b", b), b);
    await manageSpace(db, "a", a, { type: "rename", name: "共有の在庫" });
    assert.equal((await listSpaces(db, "a"))[0].name, "共有の在庫");
  } finally {
    sqlite.close();
  }
});

test("APIはCSRF、スペース切替後の古いフォーム、未所属への切替を拒否する", async () => {
  const { db, sqlite, queries } = testDatabase();
  try {
    addUser(sqlite, "a");
    const a = await personalSpace(db, "a");
    const env: Env = {
      DB: db,
      APP_ENV: "preview",
      AUTH_MODE: "test",
      ASSETS: { fetch: async () => new Response("assets") },
      BETTER_AUTH_URL: "",
      BETTER_AUTH_SECRET: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    };
    const call = (
      path: string,
      body?: unknown,
      spaceId?: string,
      origin = "http://localhost",
    ) =>
      worker.fetch(
        new Request(
          `http://localhost${path}`,
          body === undefined
            ? {}
            : {
                method: "POST",
                headers: {
                  Origin: origin,
                  "Content-Type": "application/json",
                  ...(spaceId ? { "X-Refico-Space": spaceId } : {}),
                },
                body: JSON.stringify(body),
              },
        ),
        env,
      );
    const initial = (await (await call("/api/bootstrap")).json()) as {
      spaceId: string;
      spaces: unknown[];
    };
    assert.equal(initial.spaces.length, 1);
    queries.length = 0;
    const created = await call(
      "/api/spaces",
      { type: "invite" },
      initial.spaceId,
    );
    assert.equal(created.status, 200);
    const createdBody = (await created.json()) as {
      token: string;
      expiresAt: number;
    };
    assert.equal(queries.length, 2);
    assert.ok(createdBody.expiresAt > Date.now() / 1000);
    queries.length = 0;
    assert.equal(
      (
        await call(
          "/api/spaces",
          { type: "revoke", invitationId: await tokenHash(createdBody.token) },
          initial.spaceId,
        )
      ).status,
      200,
    );
    assert.equal(queries.length, 3); // One resolve + a two-statement atomic batch.
    const invite = await createInvitation(db, "a", a);
    queries.length = 0;
    const preview = await call(`/api/invitations/${invite.token}`);
    assert.equal(preview.status, 200);
    assert.equal(
      ((await preview.json()) as { name: string }).name,
      "マイスペース",
    );
    assert.equal(queries.length, 1);
    assert.match(queries[0], /FROM space_invitations/);
    assert.equal(
      (
        await call(
          `/api/invitations/${invite.token}`,
          {},
          undefined,
          "https://evil.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (await call(`/api/invitations/${invite.token}`, {})).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/api/commands",
          {
            requestId: "stale",
            revision: 0,
            command: { type: "sample.create", date: "2026-10-01" },
          },
          initial.spaceId,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "/api/spaces",
          { type: "rename", name: "wrong" },
          initial.spaceId,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call("/api/spaces", { type: "switch", spaceId: "unknown" }))
        .status,
      403,
    );
    assert.equal(
      (await call("/api/spaces", { type: "invite" }, a)).status,
      403,
    );
    assert.equal((await call("/api/spaces", { type: "leave" }, a)).status, 200);
    assert.equal(
      ((await (await call("/api/bootstrap")).json()) as { spaceId: string })
        .spaceId,
      initial.spaceId,
    );
  } finally {
    sqlite.close();
  }
});

test("D1ランタイムでも招待のclaim・所属・選択を一括保存し退出で選択を解除する", async () => {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const { readFileSync, readdirSync } = await import("node:fs");
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      name: "sharing-test",
      modules: true,
      script: "export default {fetch(){return new Response('ok')}}",
      compatibilityDate: "2026-10-06",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = (await mf.getD1Database(
      "DB",
    )) as unknown as import("./env.ts").D1Database;
    for (const name of readdirSync(new URL("../migrations/", import.meta.url))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(
        new URL(`../migrations/${name}`, import.meta.url),
        "utf8",
      ).replace(/^--.*$/gm, "");
      await db.batch(
        (sql.match(/\s*CREATE TRIGGER[\s\S]*?\bEND;|[^;]+;/g) ?? []).map((s) =>
          db.prepare(s),
        ),
      );
    }
    for (const id of ["a", "b"])
      await db
        .prepare(
          "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,datetime('now'),datetime('now'))",
        )
        .bind(id, id, `${id}@example.com`)
        .run();
    const a = await personalSpace(db, "a");
    const b = await personalSpace(db, "b");
    assert.equal(await resolveSpace(db, "b"), b);
    const revoked = await createInvitation(db, "a", a);
    await assert.rejects(
      manageSpace(db, "b", a, {
        type: "revoke",
        invitationId: await tokenHash(revoked.token),
      }),
      /オーナー/,
    );
    await manageSpace(db, "a", a, {
      type: "revoke",
      invitationId: await tokenHash(revoked.token),
    });
    await assert.rejects(invitationInfo(db, revoked.token, "b"), /利用できません/);
    const invite = await createInvitation(db, "a", a);
    await acceptInvitation(db, invite.token, "b");
    assert.equal(await activeSpace(db, "b", b), a);
    await switchSpace(db, "b", b);
    await switchSpace(db, "b", a);
    await manageSpace(db, "a", a, { type: "remove", userId: "b" });
    assert.equal(await activeSpace(db, "b", b), b);
    assert.deepEqual(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
      [],
    );
  } finally {
    await mf.dispose();
  }
});
