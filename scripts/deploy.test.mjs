import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import {
  databaseSettings,
  runTursoMigrations,
  migrationConfig,
  deploy,
  deploymentTarget,
  stagingPreviewConfig,
} from "./deploy.mjs";
const db = (id) => ({
  binding: "DB",
  database_name: id,
  database_id: id,
  migrations_dir: "migrations",
});
const config = {
  d1_databases: [db("production")],
  previews: { d1_databases: [db("preview")] },
  name: "refico",
  main: "worker/index.ts",
  assets: { directory: "dist", binding: "ASSETS" },
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
        target === "staging"
          ? stagingPreviewConfig(config, {
              previews: { d1_databases: [db("staging")] },
            })
          : config,
        (args) => {
          calls.push(args);
          if (args[0] === "d1") {
            const generated = JSON.parse(readFileSync(args.at(-1), "utf8"));
            assert.equal(generated.d1_databases[0].database_id, target);
            assert.equal(
              generated.d1_databases[0].migrations_dir,
              join(directory, "migrations"),
            );
          } else if (target === "staging") {
            const generated = JSON.parse(readFileSync(args[2], "utf8"));
            assert.equal(generated.name, "refico");
            assert.equal(generated.env, undefined);
            assert.equal(
              generated.previews.d1_databases[0].database_id,
              "staging",
            );
            assert.equal(generated.main, join(directory, "worker/index.ts"));
            assert.equal(generated.assets.directory, join(directory, "dist"));
          }
        },
        directory,
      );
      assert.equal(calls.length, 2);
      assert.equal(calls[1][0], target === "production" ? "deploy" : "preview");
      assert.deepEqual(calls[1].slice(3), [
        "--env",
        "",
        ...(target === "staging" ? ["--name", "dev"] : []),
      ]);
      if (target !== "staging")
        assert.equal(calls[1][2], join(directory, "wrangler.jsonc"));
      assert.deepEqual(readdirSync(join(directory, ".wrangler")), []);
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

test("devだけstagingのプレビュー設定を使い、本番DBへの接続を拒否する", () => {
  assert.equal(deploymentTarget("preview", "dev"), "staging");
  assert.equal(deploymentTarget("preview", "feature/dev"), "preview");
  assert.equal(deploymentTarget("preview", undefined), "preview");
  assert.equal(deploymentTarget("production", "dev"), "production");
  const staging = stagingPreviewConfig(config, {
    previews: {
      d1_databases: [db("staging")],
      vars: { APP_ENV: "staging", AUTH_MODE: "google" },
    },
  });
  assert.equal(
    migrationConfig(staging, "staging").d1_databases[0].database_id,
    "staging",
  );
  assert.equal(staging.name, "refico");
  assert.equal(staging.previews.vars.AUTH_MODE, "google");
  assert.equal(config.previews.d1_databases[0].database_id, "preview");
  assert.throws(
    () =>
      migrationConfig(
        stagingPreviewConfig(config, {
          previews: { d1_databases: [db("production")] },
        }),
        "staging",
      ),
    /production database/,
  );
  assert.throws(() => stagingPreviewConfig(config, {}), /No D1/);
});

test("Tursoは対象環境だけをmigrateし、失敗時は配信せずD1へfallbackしない", () => {
  const directory = mkdtempSync(join(tmpdir(), "refico-turso-deploy-"));
  const production = {
    DB_BACKEND: "turso",
    TURSO_DATABASE_URL: "libsql://prod.turso.io",
  };
  const staging = {
    DB_BACKEND: "turso",
    TURSO_DATABASE_URL: "libsql://staging.turso.io",
  };
  const turso = stagingPreviewConfig(
    { ...config, vars: production },
    { previews: { vars: staging, d1_databases: [] } },
  );
  try {
    const calls = [];
    const migrations = [];
    deploy(
      "staging",
      turso,
      (args) => {
        calls.push(args);
        const generated = JSON.parse(readFileSync(args[2], "utf8"));
        assert.equal(generated.previews.vars.DB_BACKEND, "turso");
        assert.equal(
          generated.previews.vars.TURSO_DATABASE_URL,
          staging.TURSO_DATABASE_URL,
        );
        assert.deepEqual(generated.previews.d1_databases, []);
      },
      directory,
      (...args) => migrations.push(args),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "preview");
    assert.deepEqual(migrations[0], [
      "staging",
      staging.TURSO_DATABASE_URL,
      directory,
    ]);
    assert.throws(
      () =>
        deploy(
          "staging",
          turso,
          () => assert.fail("must not deploy"),
          directory,
          () => {
            throw new Error("migration failed");
          },
        ),
      /migration failed/,
    );
    assert.throws(
      () =>
        migrationConfig(
          { ...turso, previews: { vars: production } },
          "staging",
        ),
      /production database/,
    );
    assert.throws(
      () =>
        migrationConfig(
          {
            ...turso,
            previews: {
              vars: { ...staging, TURSO_DATABASE_URL: "https://prod.turso.io" },
            },
          },
          "staging",
        ),
      /production database/,
    );
    assert.throws(
      () =>
        migrationConfig(
          { ...turso, previews: { vars: { DB_BACKEND: "turso" } } },
          "preview",
        ),
      /TURSO_DATABASE_URL/,
    );
    assert.deepEqual(readdirSync(join(directory, ".wrangler")), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("リポジトリ設定は通常previewのみTursoで、dev/stagingと本番をD1に保つ", () => {
  const production = parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    [],
    { allowTrailingComma: true },
  );
  const stagingOverrides = parse(
    readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8"),
    [],
    { allowTrailingComma: true },
  );
  assert.equal(databaseSettings(production, "production").backend, "d1");
  assert.deepEqual(databaseSettings(production, "preview"), {
    backend: "turso",
    url: "libsql://refico-preview-yugu0202.aws-ap-northeast-1.turso.io",
  });
  assert.deepEqual(migrationConfig(production, "preview").d1_databases, []);
  assert.deepEqual(production.previews.d1_databases, []);
  assert.equal(
    databaseSettings(
      stagingPreviewConfig(production, stagingOverrides),
      "staging",
    ).backend,
    "d1",
  );
});

test("マイグレーションはTURSO_AUTH_TOKENだけを使い、子プロセス引数に秘密値を入れない", () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  };
  runTursoMigrations(
    "preview",
    "libsql://preview.turso.io",
    "/repo",
    {
      TURSO_AUTH_TOKEN: "test-token",
      TURSO_PREVIEW_AUTH_TOKEN: "legacy-token",
    },
    run,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.env.TURSO_AUTH_TOKEN, "test-token");
  assert.equal(
    calls[0].options.env.TURSO_DATABASE_URL,
    "libsql://preview.turso.io",
  );
  assert.deepEqual(calls[0].args, ["/repo/scripts/migrate-turso.mjs"]);
  assert.throws(
    () =>
      runTursoMigrations(
        "preview",
        "libsql://preview.turso.io",
        "/repo",
        { TURSO_PREVIEW_AUTH_TOKEN: "legacy-token" },
        run,
      ),
    /TURSO_AUTH_TOKEN is required/,
  );
});
