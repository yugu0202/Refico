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
export async function personalSpace(
  db: Database,
  userId: string,
): Promise<string> {
  const existing = await db
    .prepare(
      "SELECT space_id FROM space_members WHERE user_id = ? AND role = 'owner' ORDER BY joined_at, space_id LIMIT 1",
    )
    .bind(userId)
    .first<{ space_id: string }>();
  if (existing) return existing.space_id;
  const id = `personal:${userId}`;
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO spaces (id, owner_user_id, name) VALUES (?, ?, '自分の在庫')",
      )
      .bind(id, userId),
    db
      .prepare(
        "INSERT OR IGNORE INTO space_members (space_id, user_id, role) VALUES (?, ?, 'owner')",
      )
      .bind(id, userId),
  ]);
  return id;
}
export async function loadSnapshot(
  db: Database,
  spaceId: string,
): Promise<Snapshot> {
  const result = await db.batch([
    db.prepare("SELECT revision FROM spaces WHERE id = ?").bind(spaceId),
    ...modelTables.map((t) =>
      db
        .prepare(`SELECT data FROM ${t} WHERE space_id = ? ORDER BY rowid`)
        .bind(spaceId),
    ),
  ]);
  const space = result[0].results[0] as { revision: number } | undefined;
  if (!space) throw new Error("スペースが見つかりません");
  const model = emptyModel();
  modelTables.forEach((t, i) => {
    (model[t] as unknown[]) = result[i + 1].results.map((r) =>
      JSON.parse((r as { data: string }).data),
    );
  });
  return { model, revision: space.revision };
}
export async function receipt(
  db: Database,
  spaceId: string,
  requestId: string,
) {
  return db
    .prepare(
      "SELECT fingerprint FROM mutation_receipts WHERE space_id = ? AND request_id = ?",
    )
    .bind(spaceId, requestId)
    .first<{ fingerprint: string }>();
}
export async function saveSnapshot(
  db: Database,
  spaceId: string,
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
        "INSERT INTO mutation_receipts (space_id, request_id, user_id, expected_revision, fingerprint) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(spaceId, requestId, userId, expected, fingerprint),
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
                  `DELETE FROM ${t} WHERE space_id = ? AND id IN (SELECT value FROM json_each(?))`,
                )
                .bind(spaceId, JSON.stringify(removed)),
            ]
          : []),
        ...(changed.length
          ? [
              db
                .prepare(
                  `INSERT INTO ${t} (space_id, id, data) SELECT ?, json_extract(value, '$.id'), value FROM json_each(?) WHERE 1 ON CONFLICT(space_id, id) DO UPDATE SET data = excluded.data`,
                )
                .bind(spaceId, JSON.stringify(changed)),
            ]
          : []),
      ];
    }),
  ]);
}
