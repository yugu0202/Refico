import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrationConfig, deploy } from "./deploy.mjs";
const db = (id) => ({
  binding: "DB",
  database_name: id,
  database_id: id,
  migrations_dir: "migrations",
});
const config = {
  d1_databases: [db("production")],
  previews: { d1_databases: [db("preview")] },
  env: { staging: { d1_databases: [db("staging")] } },
};
test("環境ごとのDBを選び、本番と同じプレビューDBや未設定を拒否する", () => {
  assert.equal(
    migrationConfig(config, "production").d1_databases[0].database_id,
    "production",
  );
  assert.equal(
    migrationConfig(config, "preview").d1_databases[0].database_id,
    "preview",
  );
  assert.throws(
    () =>
      migrationConfig(
        { ...config, previews: { d1_databases: [db("production")] } },
        "preview",
      ),
    /production database/,
  );
  assert.throws(
    () => migrationConfig({ d1_databases: config.d1_databases }, "preview"),
    /No D1/,
  );
  assert.throws(() => migrationConfig(config, undefined), /Target/);
});
test("マイグレーション後に配信し、失敗時は配信せず一時設定を削除する", () => {
  const directory = mkdtempSync(join(tmpdir(), "refico-deploy-"));
  try {
    for (const target of ["production", "preview", "staging"]) {
      const calls = [];
      deploy(
        target,
        config,
        (args) => {
          calls.push(args);
          if (args[0] === "d1") {
            const generated = JSON.parse(readFileSync(args.at(-1), "utf8"));
            assert.equal(generated.d1_databases[0].database_id, target);
            assert.equal(
              generated.d1_databases[0].migrations_dir,
              join(directory, "migrations"),
            );
          }
        },
        directory,
      );
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1], [
        target === "preview" ? "preview" : "deploy",
        "--config",
        join(directory, "wrangler.jsonc"),
        ...(target === "preview"
          ? []
          : ["--env", target === "staging" ? "staging" : ""]),
      ]);
    }
    let count = 0;
    assert.throws(
      () =>
        deploy(
          "preview",
          config,
          () => {
            count++;
            throw new Error("migration failed");
          },
          directory,
        ),
      /migration failed/,
    );
    assert.equal(count, 1);
    assert.deepEqual(readdirSync(join(directory, ".wrangler")), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("stagingは専用DBを使い、本番DBと設定の欠落を拒否する", () => {
  assert.equal(
    migrationConfig(config, "staging").d1_databases[0].database_id,
    "staging",
  );
  assert.throws(
    () =>
      migrationConfig(
        { ...config, env: { staging: { d1_databases: [db("production")] } } },
        "staging",
      ),
    /production database/,
  );
  assert.throws(
    () => migrationConfig({ ...config, env: {} }, "staging"),
    /No D1/,
  );
});
