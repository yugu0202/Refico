import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.ts";
import type { Env } from "./env.ts";

for (const environment of [
  "production",
  "staging",
  "preview",
  undefined,
] as const) {
  test(`環境表示は認証・DB不要: ${environment ?? "未設定"}`, async () => {
    const response = await worker.fetch(
      new Request("https://refico.example/api/environment"),
      { APP_ENV: environment, APP_BRANCH: "feat/example" } as Env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      environment: environment ?? "production",
      branch: environment === "preview" ? "feat/example" : null,
    });
  });
}
