import type { CloudflareAccessContext } from "@cloudflare/workers-types";
import { accessUser } from "./access.ts";
import { getAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import {
  personalHousehold,
  loadSnapshot,
  receipt,
  saveSnapshot,
} from "./repository.ts";
import { applyCommand, mutationSchema } from "../src/domain/commands.ts";
import { toModel, toView } from "../src/domain/model.ts";
import { parseState } from "../src/domain/validation.ts";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function sameOrigin(
  request: Request,
  env: Pick<Env, "BETTER_AUTH_URL" | "AUTH_MODE">,
) {
  return (
    request.headers.get("origin") ===
    (env.AUTH_MODE === "access"
      ? new URL(request.url).origin
      : new URL(env.BETTER_AUTH_URL).origin)
  );
}
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx?: { readonly access?: CloudflareAccessContext },
  ): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (path === "/api/health" && request.method === "GET")
      return json({ status: "ok", storage: "server" });
    const mode = env.AUTH_MODE ?? "google";
    if (mode === "access" && env.APP_ENV !== "preview")
      return json({ error: "Access認証はプレビューでのみ利用できます" }, 503);
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
      if (mode === "access") {
        if (
          !ctx?.access &&
          request.headers.has("Cf-Access-Jwt-Assertion") &&
          (!env.ACCESS_TEAM_DOMAIN ||
            !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(
              env.ACCESS_TEAM_DOMAIN,
            ) ||
            !env.ACCESS_AUD)
        )
          return json(
            {
              error: "Access認証のサーバー設定が完了していません",
              authMode: mode,
            },
            503,
          );
        user = await accessUser(ctx?.access, db, request, env);
        if (!user)
          return json(
            { error: "Cloudflare Accessで認証してください", authMode: mode },
            401,
          );
        if (path.startsWith("/api/auth/"))
          return json({ error: "Not found" }, 404);
      } else {
        const auth = getAuth(env);
        if (path.startsWith("/api/auth/")) return auth.handler(request);
        const session = await auth.api.getSession({ headers: request.headers });
        user = session?.user ?? null;
        if (!user)
          return json({ error: "ログインしてください", authMode: mode }, 401);
      }
      if (request.method !== "GET" && !sameOrigin(request, env))
        return json({ error: "許可されていない送信元です" }, 403);
      // Membership is resolved server-side from Google or verified Access identity.
      const householdId = await personalHousehold(db, user.id);
      if (path === "/api/bootstrap" && request.method === "GET") {
        const snapshot = await loadSnapshot(db, householdId);
        return json({
          revision: snapshot.revision,
          householdId,
          authMode: mode,
          state: toView(snapshot.model),
          user: { name: user.name, email: user.email },
        });
      }
      if (path === "/api/commands" && request.method === "POST") {
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
        const fingerprint = JSON.stringify({ revision, command });
        const oldReceipt = await receipt(db, householdId, requestId);
        if (oldReceipt && oldReceipt.fingerprint !== fingerprint)
          return json({ error: "同じ送信IDで異なる内容は保存できません" }, 409);
        const snapshot = await loadSnapshot(db, householdId);
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
            householdId,
            user.id,
            revision,
            requestId,
            fingerprint,
            model,
            snapshot.model,
          );
        } catch (e) {
          const saved = await receipt(db, householdId, requestId);
          if (saved?.fingerprint === fingerprint) {
            const current = await loadSnapshot(db, householdId);
            return json({
              revision: current.revision,
              state: toView(current.model),
            });
          }
          const current = await loadSnapshot(db, householdId);
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
      console.error("Refico API failed", e);
      return json(
        { error: "処理に失敗しました。時間をおいて再試行してください" },
        500,
      );
    }
  },
};
