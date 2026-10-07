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
  const result = await db.batch([
    db
      .prepare("SELECT revision FROM households WHERE id = ?")
      .bind(householdId),
    ...modelTables.map((t) =>
      db
        .prepare(`SELECT data FROM ${t} WHERE household_id = ? ORDER BY rowid`)
        .bind(householdId),
    ),
  ]);
  const household = result[0].results[0] as { revision: number } | undefined;
  if (!household) throw new Error("家庭が見つかりません");
  const model = emptyModel();
  modelTables.forEach((t, i) => {
    (model[t] as unknown[]) = result[i + 1].results.map((r) =>
      JSON.parse((r as { data: string }).data),
    );
  });
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
