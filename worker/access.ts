import type { CloudflareAccessContext } from "@cloudflare/workers-types";
import type { Database } from "./repository.ts";
export async function accessUser(
  access: CloudflareAccessContext | undefined,
  db: Database,
) {
  // ctx.access is supplied and verified by Cloudflare, never by request headers.
  if (!access) return null;
  const identity = await access.getIdentity();
  if (!identity?.user_uuid || !identity.email) return null;
  const id = `access:${identity.user_uuid}`;
  const name = identity.name || identity.email;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, updatedAt = excluded.updatedAt
    WHERE user.name != excluded.name OR user.email != excluded.email`,
    )
    .bind(id, name, identity.email, now, now)
    .run();
  return { id, name, email: identity.email };
}
