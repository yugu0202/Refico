import type { Database } from "./repository.ts";
const initialized = new WeakMap<object, Promise<void>>();
// One persistent account per preview database, independent of URL and cookies.
export async function previewUser(db: Database, databaseIdentity: object = db) {
  const user = {
    id: "preview:shared",
    name: "プレビュー",
    email: "preview@refico.example.invalid",
  };
  // Cache by the DB binding, not the per-request D1 session. Concurrent first
  // requests share initialization; failed initialization remains retryable.
  let initialization = initialized.get(databaseIdentity);
  if (!initialization) {
    const now = Date.now();
    initialization = db
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING`,
      )
      .bind(user.id, user.name, user.email, now, now)
      .run()
      .then(() => {});
    initialized.set(databaseIdentity, initialization);
  }
  try {
    await initialization;
  } catch (error) {
    if (initialized.get(databaseIdentity) === initialization)
      initialized.delete(databaseIdentity);
    throw error;
  }
  return user;
}
