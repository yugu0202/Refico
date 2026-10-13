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
import { prepareEnvironmentIcons } from "./environment-icons.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function deploymentTarget(target, branch) {
  return target === "preview" && branch === "dev" ? "staging" : target;
}

export function stagingPreviewConfig(config, overrides) {
  if (
    overrides?.previews?.vars?.DB_BACKEND !== "turso" &&
    !overrides?.previews?.d1_databases?.length
  )
    throw new Error("No D1 databases configured for staging");
  return {
    ...config,
    previews: { ...config.previews, ...overrides.previews },
  };
}

export function databaseSettings(config, target) {
  if (!["production", "preview", "staging"].includes(target))
    throw new Error("Target must be production, preview or staging");
  // Preview vars are a separate namespace, not inherited production values.
  const vars = (target === "production" ? config : config.previews)?.vars ?? {};
  const backend = vars.DB_BACKEND ?? "d1";
  if (!["d1", "turso"].includes(backend)) throw new Error("Invalid DB_BACKEND");
  if (backend === "turso") {
    if (!vars.TURSO_DATABASE_URL)
      throw new Error("TURSO_DATABASE_URL is required");
    const host = (url) => new URL(url.replace(/^libsql:/, "https:")).host;
    if (
      target !== "production" &&
      config.vars?.TURSO_DATABASE_URL &&
      host(vars.TURSO_DATABASE_URL) === host(config.vars.TURSO_DATABASE_URL)
    )
      throw new Error(`${target} must not migrate a production database`);
  }
  return { backend, url: vars.TURSO_DATABASE_URL };
}

export function runTursoMigrations(
  target,
  url,
  directory,
  environment = process.env,
  run = spawnSync,
) {
  // Use the same credential name as the Worker runtime. The target config
  // selects the database URL; credentials stay out of configs and arguments.
  const token = environment.TURSO_AUTH_TOKEN;
  if (!token) throw new Error("TURSO_AUTH_TOKEN is required for migrations");
  const result = run(
    process.execPath,
    [join(directory, "scripts/migrate-turso.mjs")],
    {
      cwd: directory,
      stdio: "inherit",
      env: { ...environment, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Turso migrations failed");
}

export function migrationConfig(config, target, directory = root) {
  if (!["production", "preview", "staging"].includes(target))
    throw new Error("Target must be production, preview or staging");
  if (databaseSettings(config, target).backend === "turso")
    return { d1_databases: [] };
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

export function deploy(
  target,
  config,
  run,
  directory = root,
  migrate = runTursoMigrations,
) {
  const settings = databaseSettings(config, target);
  const migrations = migrationConfig(config, target, directory);
  const temporaryRoot = join(directory, ".wrangler");
  mkdirSync(temporaryRoot, { recursive: true });
  const temporary = mkdtempSync(join(temporaryRoot, "migrations-"));
  const configPath = join(temporary, "wrangler.json");
  try {
    if (settings.backend === "turso") migrate(target, settings.url, directory);
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
    if (target !== "production") {
      // Both feature branches and dev use Previews of the existing Worker.
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
            vars: {
              ...config.previews?.vars,
              APP_ENV: target,
              APP_BRANCH:
                process.env.WORKERS_CI_BRANCH ??
                (spawnSync("git", ["branch", "--show-current"], {
                  cwd: directory,
                  encoding: "utf8",
                }).stdout?.trim() ||
                  ""),
            },
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
    prepareEnvironmentIcons(
      target,
      root,
      resolve(root, config.assets.directory),
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
