import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { parse } from "jsonc-parser";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function deploymentTarget(target, branch) {
  return target === "preview" && branch === "dev" ? "staging" : target;
}

export function stagingPreviewConfig(config, overrides) {
  if (!overrides?.previews?.d1_databases?.length)
    throw new Error("No D1 databases configured for staging");
  return {
    ...config,
    previews: { ...config.previews, ...overrides.previews },
  };
}

export function migrationConfig(config, target, directory = root) {
  if (!["production", "preview", "staging"].includes(target))
    throw new Error("Target must be production, preview or staging");
  const databases = (target === "production" ? config : config.previews)
    ?.d1_databases;
  if (!Array.isArray(databases) || !databases.length)
    throw new Error(`No D1 databases configured for ${target}`);
  const productionIds = new Set(
    (config.d1_databases ?? []).map((db) => db.database_id),
  );
  return {
    d1_databases: databases.map((db) => {
      if (!db.binding || !db.database_id || !db.database_name)
        throw new Error("D1 binding, name and ID are required");
      if (target !== "production" && productionIds.has(db.database_id))
        throw new Error(`${target} must not migrate a production database`);
      return {
        ...db,
        migrations_dir: resolve(directory, db.migrations_dir ?? "migrations"),
      };
    }),
  };
}

export function deploy(target, config, run, directory = root) {
  const migrations = migrationConfig(config, target, directory);
  const temporaryRoot = join(directory, ".wrangler");
  mkdirSync(temporaryRoot, { recursive: true });
  const temporary = mkdtempSync(join(temporaryRoot, "migrations-"));
  const configPath = join(temporary, "wrangler.json");
  try {
    writeFileSync(configPath, JSON.stringify(migrations));
    for (const db of migrations.d1_databases) {
      run([
        "d1",
        "migrations",
        "apply",
        db.binding,
        "--remote",
        "--config",
        configPath,
      ]);
    }
    let deploymentPath = join(directory, "wrangler.jsonc");
    if (target === "staging") {
      // This is a dev Preview of the existing Worker, not a Wrangler environment.
      // Paths in the generated config must remain relative to the repository.
      deploymentPath = join(temporary, "deployment.json");
      writeFileSync(
        deploymentPath,
        JSON.stringify({
          ...config,
          main: resolve(directory, config.main),
          assets: {
            ...config.assets,
            directory: resolve(directory, config.assets.directory),
          },
          previews: {
            ...config.previews,
            d1_databases: migrations.d1_databases,
          },
        }),
      );
    }
    run([
      target === "production" ? "deploy" : "preview",
      "--config",
      deploymentPath,
      "--env",
      "",
      ...(target === "staging" ? ["--name", "dev"] : []),
    ]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const errors = [];
    let config = parse(
      readFileSync(join(root, "wrangler.jsonc"), "utf8"),
      errors,
      { allowTrailingComma: true },
    );
    if (errors.length) throw new Error("Invalid wrangler.jsonc");
    const target = deploymentTarget(
      process.argv[2],
      process.env.WORKERS_CI_BRANCH,
    );
    if (target === "staging") {
      const stagingErrors = [];
      const overrides = parse(
        readFileSync(join(root, "wrangler.staging.jsonc"), "utf8"),
        stagingErrors,
        { allowTrailingComma: true },
      );
      if (stagingErrors.length)
        throw new Error("Invalid wrangler.staging.jsonc");
      config = stagingPreviewConfig(config, overrides);
    }
    const require = createRequire(import.meta.url);
    const wrangler = resolve(
      dirname(require.resolve("wrangler/package.json")),
      require("wrangler/package.json").bin.wrangler,
    );
    deploy(target, config, (args) => {
      const result = spawnSync(process.execPath, [wrangler, ...args], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`Wrangler failed (${result.status ?? result.signal})`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
