import { betterAuth } from "better-auth";
import type { Env } from "./env.ts";
const createAuth = (env: Env) =>
  betterAuth({
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
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
export function getAuth(env: Env) {
  let auth = instances.get(env);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}
