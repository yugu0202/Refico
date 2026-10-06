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
export interface Bootstrap extends Snapshot {
  authMode: "google" | "test";
  householdId: string;
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
export const bootstrap = () =>
  fetch("/api/bootstrap", {
    credentials: "same-origin",
    cache: "no-store",
  }).then(result<Bootstrap>);
export function createCommandClient(transport: typeof fetch = fetch) {
  // Retain the ID after an ambiguous failure so a manual retry cannot duplicate it.
  const pending = new Map<string, string>();
  return async (command: Command, revision: number): Promise<Snapshot> => {
    const fingerprint = JSON.stringify({ revision, command });
    const requestId = pending.get(fingerprint) ?? crypto.randomUUID();
    pending.set(fingerprint, requestId);
    const body = JSON.stringify({ requestId, revision, command });
    try {
      let response: Response;
      try {
        response = await transport("/api/commands", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch {
        response = await transport("/api/commands", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
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
