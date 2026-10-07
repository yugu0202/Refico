import { emptyModel, modelTables, type Model } from "../src/domain/model.ts";
import type { D1Database, D1DatabaseSession } from "./env.ts";
export type Database = Pick<
  D1Database | D1DatabaseSession,
  "prepare" | "batch"
>;
export interface Snapshot {
  model: Model;
  revision: number;
}
// Provisioning is atomic and repeatable, even across concurrent first requests.
export async function personalHousehold(
  db: Database,
  userId: string,
): Promise<string> {
  const existing = await db
    .prepare(
      "SELECT household_id FROM household_members WHERE user_id = ? ORDER BY joined_at, household_id LIMIT 1",
    )
    .bind(userId)
    .first<{ household_id: string }>();
  if (existing) return existing.household_id;
  const id = `personal:${userId}`;
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO households (id, owner_user_id, name) VALUES (?, ?, '自分の在庫')",
      )
      .bind(id, userId),
    db
      .prepare(
        "INSERT OR IGNORE INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')",
      )
      .bind(id, userId),
  ]);
  return id;
}
export async function loadSnapshot(
  db: Database,
  householdId: string,
): Promise<Snapshot> {
  // One statement observes a consistent revision and all records. Keep one row
  // per record instead of aggregating the entire household into a large D1 row.
  // Table names come only from the server's modelTables allowlist.
  const query =
    [
      "SELECT -1 AS table_index, 0 AS record_order, NULL AS data, revision FROM households WHERE id = ?",
      ...modelTables.map(
        (t, i) =>
          `SELECT ${i} AS table_index, rowid AS record_order, data, NULL AS revision FROM ${t} WHERE household_id = ?`,
      ),
    ].join(" UNION ALL ") + " ORDER BY table_index, record_order";
  const result = await db
    .prepare(query)
    .bind(...Array(modelTables.length + 1).fill(householdId))
    .all<{
      table_index: number;
      data: string | null;
      revision: number | null;
    }>();
  const household = result.results[0];
  if (household?.table_index !== -1 || household.revision === null)
    throw new Error("家庭が見つかりません");
  const model = emptyModel();
  for (const row of result.results.slice(1)) {
    (model[modelTables[row.table_index]] as unknown[]).push(
      JSON.parse(row.data!),
    );
  }
  return { model, revision: household.revision };
}
export async function receipt(
  db: Database,
  householdId: string,
  requestId: string,
) {
  return db
    .prepare(
      "SELECT fingerprint FROM mutation_receipts WHERE household_id = ? AND request_id = ?",
    )
    .bind(householdId, requestId)
    .first<{ fingerprint: string }>();
}
export async function saveSnapshot(
  db: Database,
  householdId: string,
  userId: string,
  expected: number,
  requestId: string,
  fingerprint: string,
  model: Model,
  previous: Model,
): Promise<void> {
  // The receipt trigger checks the revision and advances it inside this batch.
  // A stale writer aborts the entire transaction before any record is replaced.
  await db.batch([
    db
      .prepare(
        "INSERT INTO mutation_receipts (household_id, request_id, user_id, expected_revision, fingerprint) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(householdId, requestId, userId, expected, fingerprint),
    ...modelTables.flatMap((t) => {
      const old = new Map(previous[t].map((r) => [r.id, JSON.stringify(r)]));
      const ids = new Set(model[t].map((r) => r.id));
      const removed = previous[t]
        .filter((r) => !ids.has(r.id))
        .map((r) => r.id);
      const changed = model[t].filter(
        (r) => old.get(r.id) !== JSON.stringify(r),
      );
      return [
        ...(removed.length
          ? [
              db
                .prepare(
                  `DELETE FROM ${t} WHERE household_id = ? AND id IN (SELECT value FROM json_each(?))`,
                )
                .bind(householdId, JSON.stringify(removed)),
            ]
          : []),
        ...(changed.length
          ? [
              db
                .prepare(
                  `INSERT INTO ${t} (household_id, id, data) SELECT ?, json_extract(value, '$.id'), value FROM json_each(?) WHERE 1 ON CONFLICT(household_id, id) DO UPDATE SET data = excluded.data`,
                )
                .bind(householdId, JSON.stringify(changed)),
            ]
          : []),
      ];
    }),
  ]);
}
