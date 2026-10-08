import test from "node:test";
import assert from "node:assert/strict";
import { connect } from "@tursodatabase/serverless";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { testTursoServer } from "../worker/test-turso.ts";
import { migrateTurso } from "./migrate-turso.mjs";

test("Tursoマイグレーションはtriggerを維持し、再実行・失敗rollback・checksumを確認する", async () => {
  const server = await testTursoServer();
  const connection = connect({ url: server.url, authToken: "test" });
  const directory = mkdtempSync(join(tmpdir(), "refico-migrations-"));
  try {
    await migrateTurso(
      connection,
      new URL("../migrations/", import.meta.url).pathname,
    );
    await migrateTurso(
      connection,
      new URL("../migrations/", import.meta.url).pathname,
    );
    assert.equal(
      server.sqlite.prepare("SELECT count(*) AS n FROM refico_migrations").get()
        .n,
      5,
    );
    assert.ok(
      server.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name='invitation_join'")
        .get(),
    );
    writeFileSync(
      join(directory, "9999_failure.sql"),
      "CREATE TABLE should_rollback(id TEXT); INSERT INTO missing_table VALUES(1);",
    );
    await assert.rejects(migrateTurso(connection, directory), /missing_table/);
    assert.equal(
      server.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name='should_rollback'")
        .get(),
      undefined,
    );
    assert.equal(
      server.sqlite
        .prepare(
          "SELECT name FROM refico_migrations WHERE name='9999_failure.sql'",
        )
        .get(),
      undefined,
    );
    rmSync(join(directory, "9999_failure.sql"));
    writeFileSync(join(directory, "0001_auth.sql"), "SELECT 1;");
    await assert.rejects(
      migrateTurso(connection, directory),
      /Applied migration changed/,
    );
  } finally {
    await connection.close();
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
