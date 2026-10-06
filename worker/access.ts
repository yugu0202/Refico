import type { CloudflareAccessContext } from "@cloudflare/workers-types";
import {
  createRemoteJWKSet,
  jwtVerify,
  errors,
  type JWTVerifyGetKey,
} from "jose";
import type { Env } from "./env.ts";
import type { Database } from "./repository.ts";
const keySets = new Map<string, JWTVerifyGetKey>();
export async function accessJwtIdentity(
  token: string,
  env: Pick<Env, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD">,
  keys?: JWTVerifyGetKey,
) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (
    !domain ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
    !env.ACCESS_AUD
  )
    throw new Error("Access JWT verification settings are missing");
  const issuer = `https://${domain}`;
  if (!keys) {
    keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keySets.set(issuer, keys);
    }
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "email", "exp", "iat"],
    });
    if (!payload.sub || typeof payload.email !== "string" || !payload.email)
      return null;
    return {
      user_uuid: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
    };
  } catch (error) {
    if (
      error instanceof errors.JOSEError &&
      !(error instanceof errors.JWKSTimeout)
    )
      return null;
    throw error;
  }
}
export async function accessUser(
  access: CloudflareAccessContext | undefined,
  db: Database,
  request: Request,
  env: Env,
) {
  // Static Assets' router does not forward ctx.access. Verify Access's signed
  // assertion against configured issuer and application audience in that case.
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  const identity = access
    ? await access.getIdentity()
    : token
      ? await accessJwtIdentity(token, env)
      : null;
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
