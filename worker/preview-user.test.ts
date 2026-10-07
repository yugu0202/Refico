import test from "node:test";
import assert from "node:assert/strict";
import { previewUser } from "./preview-user.ts";
import { testDatabase } from "./test-db.ts";

test("preview初期化は同時・後続セッションで共有し、DBごとに分離する", async () => {
  const a = testDatabase();
  const b = testDatabase();
  try {
    const session = () => ({
      prepare: a.db.prepare.bind(a.db),
      batch: a.db.batch.bind(a.db),
    });
    const users = await Promise.all(
      Array.from({ length: 5 }, () => previewUser(session(), a.db)),
    );
    assert.ok(users.every((u) => u.id === "preview:shared"));
    await previewUser(session(), a.db);
    assert.equal(a.queries.length, 1);
    await previewUser(b.db, b.db);
    assert.equal(b.queries.length, 1);
  } finally {
    a.sqlite.close();
    b.sqlite.close();
  }
});

test("preview初期化の失敗はキャッシュせず再試行できる", async () => {
  const { db, sqlite, queries } = testDatabase();
  const identity = {};
  try {
    sqlite.exec(
      "CREATE TRIGGER fail_preview BEFORE INSERT ON user BEGIN SELECT RAISE(ABORT, 'temporarily_unavailable'); END",
    );
    await assert.rejects(previewUser(db, identity), /temporarily_unavailable/);
    sqlite.exec("DROP TRIGGER fail_preview");
    assert.equal((await previewUser(db, identity)).id, "preview:shared");
    await previewUser(db, identity);
    assert.equal(queries.length, 2);
  } finally {
    sqlite.close();
  }
});
