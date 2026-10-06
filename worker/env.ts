import type {
  D1Database,
  D1DatabaseSession,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
export type { D1Database, D1DatabaseSession, D1PreparedStatement, D1Result };
export interface Env {
  APP_ENV?: "production" | "preview" | "development";
  AUTH_MODE?: "google" | "test";
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export function sampleDataEnabled(env: Pick<Env, "APP_ENV">): boolean {
  return env.APP_ENV === "preview" || env.APP_ENV === "development";
}
