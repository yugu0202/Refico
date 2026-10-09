import test from "node:test";
import assert from "node:assert/strict";
import { createBootstrapClient, createCommandClient } from "./api.ts";

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

test("重なるbootstrapは1リクエストになり、完了後と失敗後は取得し直す", async () => {
  let calls = 0;
  let fail = false;
  let finish!: (response: Response) => void;
  const client = createBootstrapClient((async () => {
    ++calls;
    if (fail) throw new Error("offline");
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  }) as typeof fetch);
  const first = client();
  const second = client();
  assert.equal(calls, 1);
  finish(Response.json({ revision: 0 }));
  assert.deepEqual(await first, await second);
  fail = true;
  await assert.rejects(client(), /offline/);
  fail = false;
  const next = client();
  finish(Response.json({ revision: 1 }));
  assert.equal((await next).revision, 1);
  assert.equal(calls, 3);
});

test("競合復旧のbootstrapは保存前から取得中の応答を再利用しない", async () => {
  const responses: ((response: Response) => void)[] = [];
  const client = createBootstrapClient(
    (async () =>
      new Promise<Response>((resolve) => {
        responses.push(resolve);
      })) as typeof fetch,
  );
  const old = client();
  const recovery = client(true);
  assert.equal(responses.length, 2);
  responses[1](Response.json({ revision: 2 }));
  assert.equal((await recovery).revision, 2);
  responses[0](Response.json({ revision: 0 }));
  assert.equal((await old).revision, 0);
});

test("同じ入力でもスペースごとに再送IDと操作対象を分離する", async () => {
  const sent: { id: string; space: string | null }[] = [];
  const client = createCommandClient((async (_url, init: RequestInit) => {
    sent.push({
      id: JSON.parse(init.body as string).requestId,
      space: new Headers(init.headers).get("X-Refico-Space"),
    });
    throw new Error("lost response");
  }) as typeof fetch);
  const command = { type: "sample.create", date: "2026-10-01" } as const;
  await assert.rejects(client(command, 0, "a"));
  await assert.rejects(client(command, 0, "b"));
  assert.equal(sent[0].space, "a");
  assert.equal(sent[2].space, "b");
  assert.equal(sent[0].id, sent[1].id);
  assert.notEqual(sent[0].id, sent[2].id);
});

test("差分応答を適用し、古いサーバーの全件応答も受け付ける", async () => {
  const { emptyState } = await import("./domain/inventory.ts");
  const { diffState } = await import("./domain/snapshot.ts");
  const base = emptyState();
  const next = {
    ...base,
    products: [{ id: "rice", name: "米", baseUnit: "g" as const, units: [] }],
  };
  let delta = true;
  const client = createCommandClient((async (_url, init) => {
    assert.equal(
      new Headers(init?.headers).get("X-Refico-Response"),
      "delta-v1",
    );
    return Response.json(
      delta
        ? { revision: 1, baseRevision: 0, changes: diffState(base, next) }
        : { revision: 1, state: next },
    );
  }) as typeof fetch);
  const command = { type: "sample.create", date: "2026-10-01" } as const;
  assert.deepEqual((await client(command, 0, "space", base)).state, next);
  delta = false;
  assert.deepEqual((await client(command, 0, "space", base)).state, next);
});

test("差分を復元できない場合も同じ送信IDで全件応答を回収する", async () => {
  const { emptyState } = await import("./domain/inventory.ts");
  const base = emptyState();
  const bodies: string[] = [];
  const modes: (string | null)[] = [];
  const client = createCommandClient((async (_url, init) => {
    bodies.push(init?.body as string);
    modes.push(new Headers(init?.headers).get("X-Refico-Response"));
    return Response.json(
      bodies.length === 1
        ? { revision: 5, baseRevision: 4, changes: {} }
        : { revision: 5, state: base },
    );
  }) as typeof fetch);
  assert.equal(
    (
      await client(
        { type: "sample.create", date: "2026-10-01" },
        0,
        "space",
        base,
      )
    ).revision,
    5,
  );
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(modes, ["delta-v1", null]);
});
