import { z } from "zod";
import {
  activeSpace,
  listSpaces,
  switchSpace,
  spaceDetails,
  createInvitation,
  invitationInfo,
  acceptInvitation,
  manageSpace,
  SharingError,
} from "./sharing.ts";
import { previewUser } from "./preview-user.ts";
import { getAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { sampleDataEnabled } from "./env.ts";
import {
  personalSpace,
  loadSnapshot,
  receipt,
  saveSnapshot,
} from "./repository.ts";
import { applyCommand, mutationSchema } from "../src/domain/commands.ts";
import { toModel, toView } from "../src/domain/model.ts";
import { parseState } from "../src/domain/validation.ts";
export function sameOrigin(
  request: Request,
  env: Pick<Env, "BETTER_AUTH_URL" | "AUTH_MODE">,
) {
  return (
    request.headers.get("origin") ===
    (env.AUTH_MODE === "test"
      ? new URL(request.url).origin
      : new URL(env.BETTER_AUTH_URL).origin)
  );
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: responseHeaders });
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (path === "/api/health" && request.method === "GET")
      return json({ status: "ok", storage: "server" });
    const mode = env.AUTH_MODE ?? "google";
    if (
      (mode !== "google" && mode !== "test") ||
      (mode === "test" && env.APP_ENV !== "preview")
    )
      return json({ error: "認証設定を確認してください", authMode: mode }, 503);
    if (
      !env.DB ||
      (mode === "google" &&
        (!env.BETTER_AUTH_URL ||
          !env.BETTER_AUTH_SECRET ||
          !env.GOOGLE_CLIENT_ID ||
          !env.GOOGLE_CLIENT_SECRET))
    )
      return json(
        { error: "サーバー設定が完了していません", authMode: mode },
        503,
      );
    try {
      const db = env.DB.withSession("first-primary");
      let user: { id: string; name: string; email: string } | null;
      if (mode === "test") {
        user = await previewUser(db, env.DB);
        if (path.startsWith("/api/auth/"))
          return json({ error: "Not found" }, 404);
      } else {
        const auth = getAuth(env);
        if (path.startsWith("/api/auth/")) return auth.handler(request);
        const { response: session, headers } = await auth.api.getSession({
          headers: request.headers,
          returnHeaders: true,
        });
        // Forward every cookie separately, including cache refresh/expiry on
        // API errors. Otherwise caching stops working after the first expiry.
        for (const cookie of headers.getSetCookie())
          responseHeaders.append("Set-Cookie", cookie);
        user = session?.user ?? null;
        if (!user)
          return json({ error: "ログインしてください", authMode: mode }, 401);
      }
      if (request.method !== "GET" && !sameOrigin(request, env))
        return json({ error: "許可されていない送信元です" }, 403);
      // Membership is resolved server-side from Google session or the shared preview account.
      const personalId = await personalSpace(db, user.id);
      const spaceId = await activeSpace(db, user.id, personalId);
      const inviteMatch = path.match(/^\/api\/invitations\/([a-f0-9]{64})$/);
      if (inviteMatch && request.method === "GET")
        return json(await invitationInfo(db, inviteMatch[1], user.id));
      if (inviteMatch && request.method === "POST") {
        await acceptInvitation(db, inviteMatch[1], user.id);
        return json({ ok: true });
      }
      if (path === "/api/spaces/details" && request.method === "GET") {
        if (
          request.headers.get("X-Refico-Space") &&
          request.headers.get("X-Refico-Space") !== spaceId
        )
          return json(
            { error: "スペースが変更されています。再読み込みしてください" },
            409,
          );
        return json(await spaceDetails(db, spaceId));
      }
      if (path === "/api/spaces" && request.method === "POST") {
        if (
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          return json({ error: "JSON形式で送信してください" }, 415);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 4096)
          return json({ error: "入力が大きすぎます" }, 413);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "入力を確認してください" }, 400);
        }
        const schema = z.discriminatedUnion("type", [
          z
            .object({
              type: z.literal("switch"),
              spaceId: z.string().min(1).max(256),
            })
            .strict(),
          z.object({ type: z.literal("invite") }).strict(),
          z.object({ type: z.literal("leave") }).strict(),
          z
            .object({
              type: z.literal("rename"),
              name: z.string().trim().min(1).max(80),
            })
            .strict(),
          z
            .object({
              type: z.literal("remove"),
              userId: z.string().min(1).max(256),
            })
            .strict(),
          z
            .object({
              type: z.literal("revoke"),
              invitationId: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .strict(),
        ]);
        const parsed = schema.safeParse(body);
        if (!parsed.success)
          return json({ error: "入力を確認してください" }, 400);
        if (parsed.data.type === "switch")
          await switchSpace(db, user.id, parsed.data.spaceId);
        else {
          if (request.headers.get("X-Refico-Space") !== spaceId)
            return json(
              { error: "スペースが変更されています。再読み込みしてください" },
              409,
            );
          if (parsed.data.type === "invite")
            return json(await createInvitation(db, user.id, spaceId));
          await manageSpace(db, user.id, spaceId, parsed.data);
        }
        return json({ ok: true });
      }
      if (path === "/api/bootstrap" && request.method === "GET") {
        const snapshot = await loadSnapshot(db, spaceId);
        return json({
          revision: snapshot.revision,
          spaces: await listSpaces(db, user.id),
          spaceId,
          authMode: mode,
          sampleDataEnabled: sampleDataEnabled(env),
          state: toView(snapshot.model),
          user: { name: user.name, email: user.email },
        });
      }
      if (path === "/api/commands" && request.method === "POST") {
        const expectedSpace = request.headers.get("X-Refico-Space");
        if (expectedSpace && expectedSpace !== spaceId)
          return json(
            { error: "スペースが変更されています。再読み込みしてください" },
            409,
          );
        if (
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          return json({ error: "JSON形式で送信してください" }, 415);
        if (Number(request.headers.get("content-length")) > 65536)
          return json({ error: "入力が大きすぎます" }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 65536)
          return json({ error: "入力が大きすぎます" }, 413);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "入力を確認してください" }, 400);
        }
        const parsed = mutationSchema.safeParse(body);
        if (!parsed.success)
          return json({ error: "入力を確認してください" }, 400);
        const { requestId, revision, command } = parsed.data;
        // Enforce deployment policy before receipts, so even a replay is denied.
        if (command.type === "sample.create" && !sampleDataEnabled(env))
          return json(
            { error: "サンプルデータはこの環境では追加できません" },
            403,
          );
        const fingerprint = JSON.stringify({ revision, command });
        const oldReceipt = await receipt(db, spaceId, requestId);
        if (oldReceipt && oldReceipt.fingerprint !== fingerprint)
          return json({ error: "同じ送信IDで異なる内容は保存できません" }, 409);
        const snapshot = await loadSnapshot(db, spaceId);
        if (oldReceipt)
          return json({
            revision: snapshot.revision,
            state: toView(snapshot.model),
          });
        if (snapshot.revision !== revision)
          return json(
            {
              error:
                "別の操作で更新されています。再読み込みしてから保存してください",
              code: "revision_conflict",
            },
            409,
          );
        let next;
        try {
          next = parseState(
            JSON.stringify(applyCommand(toView(snapshot.model), command)),
          );
        } catch (e) {
          return json(
            {
              error: e instanceof Error ? e.message : "入力を確認してください",
            },
            422,
          );
        }
        const model = toModel(next, snapshot.model);
        // Validate the canonical projection as well as the calculation result.
        parseState(JSON.stringify(toView(model)));
        try {
          await saveSnapshot(
            db,
            spaceId,
            user.id,
            revision,
            requestId,
            fingerprint,
            model,
            snapshot.model,
          );
        } catch (e) {
          const saved = await receipt(db, spaceId, requestId);
          if (saved?.fingerprint === fingerprint) {
            const current = await loadSnapshot(db, spaceId);
            return json({
              revision: current.revision,
              state: toView(current.model),
            });
          }
          const current = await loadSnapshot(db, spaceId);
          if (current.revision !== revision || saved)
            return json(
              {
                error:
                  "別の操作で更新されています。再読み込みしてから保存してください",
                code: "revision_conflict",
              },
              409,
            );
          throw e;
        }
        return json({ revision: revision + 1, state: toView(model) });
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      if (e instanceof SharingError)
        return json({ error: e.message }, e.status);
      console.error("Refico API failed", e);
      return json(
        { error: "処理に失敗しました。時間をおいて再試行してください" },
        500,
      );
    }
  },
};
