import test from "node:test";
import assert from "node:assert/strict";
import { createFocusRefresh } from "./refresh.ts";

test("短時間のfocus・保存中・取得中は再取得せず、保存成功から5分後に再取得する", async () => {
  let now = 0;
  let busy = false;
  let calls = 0;
  let complete!: () => void;
  const refresh = createFocusRefresh(
    async () => {
      ++calls;
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    },
    () => busy,
    () => now,
  );
  refresh.markFresh();
  for (now = 1; now < 300000; now += 10000) await refresh.refresh();
  assert.equal(calls, 0);
  now = 300000;
  busy = true;
  await refresh.refresh();
  assert.equal(calls, 0);
  busy = false;
  const pending = refresh.refresh();
  now += 300000;
  await refresh.refresh();
  assert.equal(calls, 1);
  complete();
  await pending;
  refresh.markFresh(); // Successful command response.
  now += 299999;
  await refresh.refresh();
  assert.equal(calls, 1);
  now += 1;
  const next = refresh.refresh();
  assert.equal(calls, 2);
  complete();
  await next;
});

test("再取得失敗でfocus連打を抑え、5分後には再試行する", async () => {
  let now = 0;
  let calls = 0;
  const refresh = createFocusRefresh(
    async () => {
      ++calls;
      throw new Error("offline");
    },
    () => false,
    () => now,
  );
  await assert.rejects(refresh.refresh(), /offline/);
  now = 1;
  await refresh.refresh();
  assert.equal(calls, 1);
  now = 300000;
  await assert.rejects(refresh.refresh(), /offline/);
  assert.equal(calls, 2);
});
