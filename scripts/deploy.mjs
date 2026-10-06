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

export function migrationConfig(config, target, directory = root) {
  if (!["production", "preview"].includes(target))
    throw new Error("Target must be production or preview");
  const databases = (target === "preview" ? config.previews : config)
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
      if (target === "preview" && productionIds.has(db.database_id))
        throw new Error("Preview must not migrate a production database");
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
    run([
      target === "preview" ? "preview" : "deploy",
      "--config",
      join(directory, "wrangler.jsonc"),
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
    const config = parse(
      readFileSync(join(root, "wrangler.jsonc"), "utf8"),
      errors,
      { allowTrailingComma: true },
    );
    if (errors.length) throw new Error("Invalid wrangler.jsonc");
    const require = createRequire(import.meta.url);
    const wrangler = resolve(
      dirname(require.resolve("wrangler/package.json")),
      require("wrangler/package.json").bin.wrangler,
    );
    deploy(process.argv[2], config, (args) => {
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
