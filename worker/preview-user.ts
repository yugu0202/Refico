import type { Database } from "./repository.ts";
// One persistent account per preview database, independent of URL and cookies.
export async function previewUser(db: Database) {
  const user = {
    id: "preview:shared",
    name: "プレビュー",
    email: "preview@refico.example.invalid",
  };
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(user.id, user.name, user.email, now, now)
    .run();
  return user;
}
