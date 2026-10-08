import { betterAuth } from "better-auth";
import { authDialect } from "./auth-dialect.ts";
import { TursoDatabase, type Database } from "./database.ts";
import type { Env } from "./env.ts";
const createAuth = (env: Env, db?: Database) =>
  betterAuth({
    database:
      db instanceof TursoDatabase
        ? { dialect: authDialect(db), type: "sqlite", transaction: false }
        : env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    // Revocation on other devices is observed within five minutes. Membership
    // is still resolved from the database on every request, never from this cookie.
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    advanced: { database: { validateSchema: false } },
    rateLimit: { enabled: true, storage: "memory" },
  });
const instances = new WeakMap<object, ReturnType<typeof createAuth>>();
export function getAuth(env: Env, db?: Database) {
  // A Turso client holds a mutable session; keep it scoped to this request.
  if (db instanceof TursoDatabase) return createAuth(env, db);
  let auth = instances.get(env);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}
