import { createAuthClient } from "better-auth/client";
import type { Command } from "./domain/commands.ts";
import type { State } from "./domain/inventory.ts";
export const authClient = createAuthClient();
export class ApiError extends Error {
  status: number;
  authMode?: "google" | "test";
  constructor(message: string, status: number, authMode?: "google" | "test") {
    super(message);
    this.status = status;
    this.authMode = authMode;
  }
}
export interface Snapshot {
  state: State;
  revision: number;
}
export interface Space {
  id: string;
  name: string;
  role: "owner" | "member";
}
export interface Bootstrap extends Snapshot {
  spaces: Space[];
  authMode: "google" | "test";
  sampleDataEnabled: boolean;
  spaceId: string;
  user: { name: string; email: string };
}
async function result<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.error ?? "通信に失敗しました",
      response.status,
      body.authMode,
    );
  return body;
}
export function createBootstrapClient(transport: typeof fetch = fetch) {
  let pending: Promise<Bootstrap> | undefined;
  const load = () =>
    transport("/api/bootstrap", {
      credentials: "same-origin",
      cache: "no-store",
    }).then(result<Bootstrap>);
  return (force = false) => {
    // Conflict/auth recovery must not reuse a request started before saving.
    if (force) return load();
    // Deduplicate overlapping loads (including React StrictMode setup) without
    // caching completed responses or hiding subsequent authentication changes.
    pending ??= load().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
export const bootstrap = createBootstrapClient();
export function createCommandClient(transport: typeof fetch = fetch) {
  // Retain the ID after an ambiguous failure so a manual retry cannot duplicate it.
  const pending = new Map<string, string>();
  return async (
    command: Command,
    revision: number,
    spaceId?: string,
  ): Promise<Snapshot> => {
    const fingerprint = JSON.stringify({ revision, command, spaceId });
    const requestId = pending.get(fingerprint) ?? crypto.randomUUID();
    pending.set(fingerprint, requestId);
    const body = JSON.stringify({ requestId, revision, command });
    try {
      let response: Response;
      try {
        response = await transport("/api/commands", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(spaceId ? { "X-Refico-Space": spaceId } : {}),
          },
          body,
        });
      } catch {
        response = await transport("/api/commands", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(spaceId ? { "X-Refico-Space": spaceId } : {}),
          },
          body,
        });
      }
      const snapshot = await result<Snapshot>(response);
      pending.delete(fingerprint);
      return snapshot;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) pending.delete(fingerprint);
      throw e instanceof ApiError
        ? e
        : new Error("通信できませんでした。接続を確認して再試行してください");
    }
  };
}
export const sendCommand = createCommandClient();

export function sharingRequest<T>(
  path: string,
  body?: unknown,
  spaceId?: string,
): Promise<T> {
  return fetch(path, {
    ...(spaceId ? { headers: { "X-Refico-Space": spaceId } } : {}),
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(spaceId ? { "X-Refico-Space": spaceId } : {}),
          },
          body: JSON.stringify(body),
        }),
  }).then(result<T>);
}
