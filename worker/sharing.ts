import { personalSpace, type Database } from "./repository.ts";
export class SharingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function listSpaces(db: Database, userId: string) {
  return (
    await db
      .prepare(
        `SELECT s.id, s.name, m.role FROM spaces s JOIN space_members m ON m.space_id = s.id WHERE m.user_id = ? ORDER BY m.joined_at, s.id`,
      )
      .bind(userId)
      .all()
  ).results;
}
export async function activeSpace(
  db: Database,
  userId: string,
  fallback: string,
) {
  const row = await db
    .prepare(
      `SELECT p.active_space_id AS id FROM user_preferences p JOIN space_members m ON m.space_id = p.active_space_id AND m.user_id = p.user_id WHERE p.user_id = ?`,
    )
    .bind(userId)
    .first<{ id: string }>();
  return row?.id ?? fallback;
}
export async function resolveSpace(db: Database, userId: string) {
  // Resolve the valid selection and personal fallback in one round trip.
  // Provision only when neither exists (the first request of a new user).
  const row = await db
    .prepare(
      `SELECT space_id AS id FROM space_members WHERE user_id = ? AND
       (space_id = (SELECT active_space_id FROM user_preferences WHERE user_id = ?) OR role = 'owner')
       ORDER BY CASE WHEN space_id = (SELECT active_space_id FROM user_preferences WHERE user_id = ?) THEN 0 ELSE 1 END,
       joined_at, space_id LIMIT 1`,
    )
    .bind(userId, userId, userId)
    .first<{ id: string }>();
  return row?.id ?? (await personalSpace(db, userId));
}
export async function switchSpace(db: Database, userId: string, id: string) {
  const result = await db
    .prepare(
      `INSERT INTO user_preferences (user_id, active_space_id) SELECT user_id, space_id FROM space_members WHERE user_id = ? AND space_id = ? ON CONFLICT(user_id) DO UPDATE SET active_space_id = excluded.active_space_id`,
    )
    .bind(userId, id)
    .run();
  if (!result.meta.changes)
    throw new SharingError("スペースに所属していません", 403);
}
async function owner(db: Database, userId: string, id: string) {
  const row = await db
    .prepare(
      `SELECT role FROM space_members WHERE space_id = ? AND user_id = ?`,
    )
    .bind(id, userId)
    .first<{ role: string }>();
  if (row?.role !== "owner")
    throw new SharingError("オーナーだけが操作できます", 403);
}
export async function spaceDetails(db: Database, id: string) {
  const [members, invitations] = await db.batch([
    db
      .prepare(
        `SELECT u.id, u.name, m.role FROM space_members m JOIN user u ON u.id = m.user_id WHERE m.space_id = ? ORDER BY m.joined_at, u.id`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT token_hash AS id, expires_at AS expiresAt FROM space_invitations WHERE space_id = ? AND accepted_by IS NULL AND revoked_at IS NULL AND expires_at > unixepoch() ORDER BY created_at DESC`,
      )
      .bind(id),
  ]);
  return { members: members.results, invitations: invitations.results };
}
export async function createInvitation(
  db: Database,
  userId: string,
  id: string,
) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const now = Math.floor(Date.now() / 1000);
  const hash = await tokenHash(token);
  const result = await db
    .prepare(
      `INSERT INTO space_invitations (token_hash, space_id, created_by, expires_at, created_at) SELECT ?, space_id, user_id, ?, ? FROM space_members WHERE space_id = ? AND user_id = ? AND role = 'owner'`,
    )
    .bind(hash, now + 7 * 86400, now, id, userId)
    .run();
  if (!result.meta.changes)
    throw new SharingError("オーナーだけが操作できます", 403);
  return { token, expiresAt: now + 7 * 86400 };
}
export async function invitationInfo(
  db: Database,
  token: string,
  userId: string,
) {
  const row = await db
    .prepare(
      `SELECT i.space_id AS spaceId, s.name, i.accepted_by AS acceptedBy FROM space_invitations i JOIN spaces s ON s.id = i.space_id WHERE i.token_hash = ? AND ((i.accepted_by = ? AND EXISTS (SELECT 1 FROM space_members WHERE space_id = i.space_id AND user_id = i.accepted_by)) OR (i.accepted_by IS NULL AND i.revoked_at IS NULL AND i.expires_at > unixepoch() AND EXISTS (SELECT 1 FROM space_members WHERE space_id = i.space_id AND user_id = i.created_by AND role = 'owner')))`,
    )
    .bind(await tokenHash(token), userId)
    .first<{ spaceId: string; name: string; acceptedBy: string | null }>();
  if (!row)
    throw new SharingError(
      "この招待リンクは利用できません。招待した人に新しいリンクを発行してもらってください",
      410,
    );
  return row;
}
export async function acceptInvitation(
  db: Database,
  token: string,
  userId: string,
) {
  const info = await invitationInfo(db, token, userId);
  if (info.acceptedBy === userId) {
    await switchSpace(db, userId, info.spaceId);
    return;
  }
  // Opening one's own link or joining an already-shared space must not burn
  // the single-use invitation intended for a new member.
  const member = await db
    .prepare(
      "SELECT 1 AS present FROM space_members WHERE space_id = ? AND user_id = ?",
    )
    .bind(info.spaceId, userId)
    .first();
  if (member) {
    await switchSpace(db, userId, info.spaceId);
    return;
  }
  const result = await db
    .prepare(
      `UPDATE space_invitations SET accepted_by = ? WHERE token_hash = ? AND accepted_by IS NULL AND revoked_at IS NULL AND expires_at > unixepoch()`,
    )
    .bind(userId, await tokenHash(token))
    .run();
  if (!result.meta.changes)
    throw new SharingError(
      "この招待リンクは利用できません。招待した人に新しいリンクを発行してもらってください",
      410,
    );
}
export async function manageSpace(
  db: Database,
  userId: string,
  id: string,
  action: {
    type: string;
    name?: string;
    userId?: string;
    invitationId?: string;
  },
) {
  if (action.type === "revoke") {
    // Keep idempotent revocation and the explicit owner error while checking
    // authorization and updating within one atomic database round trip.
    const [membership] = await db.batch<{ role: string }>([
      db
        .prepare(
          "SELECT role FROM space_members WHERE space_id = ? AND user_id = ?",
        )
        .bind(id, userId),
      db
        .prepare(
          `UPDATE space_invitations SET revoked_at = unixepoch()
        WHERE token_hash = ? AND space_id = ? AND accepted_by IS NULL
        AND EXISTS (SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ? AND role = 'owner')`,
        )
        .bind(action.invitationId!, id, id, userId),
    ]);
    if (membership.results[0]?.role !== "owner")
      throw new SharingError("オーナーだけが操作できます", 403);
    return;
  }
  if (action.type === "leave") {
    const row = await db
      .prepare(
        `SELECT role FROM space_members WHERE space_id = ? AND user_id = ?`,
      )
      .bind(id, userId)
      .first<{ role: string }>();
    if (row?.role !== "member")
      throw new SharingError("オーナーはスペースから退出できません");
    await db
      .prepare(
        `DELETE FROM space_members WHERE space_id = ? AND user_id = ? AND role = 'member'`,
      )
      .bind(id, userId)
      .run();
    return;
  }
  await owner(db, userId, id);
  if (action.type === "rename")
    await db
      .prepare(`UPDATE spaces SET name = ? WHERE id = ?`)
      .bind(action.name!, id)
      .run();
  else if (action.type === "remove")
    await db
      .prepare(
        `DELETE FROM space_members WHERE space_id = ? AND user_id = ? AND role = 'member'`,
      )
      .bind(id, action.userId!)
      .run();
}
