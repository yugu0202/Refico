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
  env: Pick<Env, "BETTER_AUTH_URL">,
) {
  return request.headers.get("origin") === new URL(env.BETTER_AUTH_URL).origin;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (path === "/api/health" && request.method === "GET")
      return json({ status: "ok", storage: "server" });
    if (
      !env.DB ||
      !env.BETTER_AUTH_URL ||
      !env.BETTER_AUTH_SECRET ||
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET
    )
      return json({ error: "サーバー設定が完了していません" }, 503);
    try {
      const auth = getAuth(env);
      if (path.startsWith("/api/auth/")) return auth.handler(request);
      if (request.method !== "GET" && !sameOrigin(request, env))
        return json({ error: "許可されていない送信元です" }, 403);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return json({ error: "ログインしてください" }, 401);
      // Membership is resolved server-side. Client input cannot select another owner.
      const db = env.DB.withSession("first-primary");
      const householdId = await personalHousehold(db, session.user.id);
      if (path === "/api/bootstrap" && request.method === "GET") {
        const snapshot = await loadSnapshot(db, householdId);
        return json({
          revision: snapshot.revision,
          householdId,
          state: toView(snapshot.model),
          user: { name: session.user.name, email: session.user.email },
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
            session.user.id,
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
