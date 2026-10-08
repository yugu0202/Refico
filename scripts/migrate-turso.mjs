import { connect } from "@tursodatabase/serverless";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function migrateTurso(connection, directory) {
  await connection.exec("PRAGMA foreign_keys = ON");
  await connection.exec(`CREATE TABLE IF NOT EXISTS refico_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const [history] = await connection.batch([
    "SELECT name, checksum FROM refico_migrations",
  ]);
  const applied = new Map(history.rows.map((row) => [row.name, row.checksum]));
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  // Check all old checksums before applying anything new.
  const migrations = files.map((name) => {
    const sql = readFileSync(resolve(directory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(name) && applied.get(name) !== checksum)
      throw new Error(`Applied migration changed: ${name}`);
    return { name, sql, checksum };
  });
  for (const { name, sql, checksum } of migrations) {
    if (applied.has(name)) continue;
    // Keep the file intact: splitting on semicolons destroys trigger bodies.
    // transaction() uses this connection, including its foreign_keys PRAGMA.
    await connection
      .transaction(async () => {
        // Recheck under the write lock for concurrent deploys.
        const [existingRows] = await connection.batch([
          {
            sql: "SELECT checksum FROM refico_migrations WHERE name = ?",
            args: [name],
          },
        ]);
        const existing = existingRows.rows[0];
        if (existing) {
          if (existing.checksum !== checksum)
            throw new Error(`Applied migration changed: ${name}`);
          return;
        }
        await connection.exec(sql);
        await connection.batch([
          {
            sql: "INSERT INTO refico_migrations (name, checksum) VALUES (?, ?)",
            args: [name, checksum],
          },
        ]);
      })
      .immediate();
    console.log(`Applied ${name}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (!url || !authToken) {
    console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
    process.exitCode = 1;
  } else {
    const connection = connect({ url, authToken });
    try {
      await migrateTurso(
        connection,
        new URL("../migrations/", import.meta.url).pathname,
      );
    } catch {
      // Driver errors can contain connection information; keep credentials out of CI logs.
      console.error("Turso migration failed; deployment stopped");
      process.exitCode = 1;
    } finally {
      await connection.close().catch(() => {});
    }
  }
}
