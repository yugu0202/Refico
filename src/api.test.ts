import test from "node:test";
import assert from "node:assert/strict";
import { createCommandClient } from "./api.ts";

test("応答を失った自動再送・手動再試行で送信IDを維持する", async () => {
  const bodies: string[] = [];
  let count = 0;
  const client = createCommandClient((async (
    _url: unknown,
    init: RequestInit,
  ) => {
    bodies.push(init.body as string);
    count++;
    if (count <= 2) throw new Error("connection reset after commit");
    return Response.json({ revision: 1, state: {} });
  }) as typeof fetch);
  const command = { type: "sample.create", date: "2026-10-01" } as const;
  await assert.rejects(client(command, 0), /通信/);
  const result = await client(command, 0);
  assert.equal(result.revision, 1);
  assert.equal(new Set(bodies).size, 1);
});
