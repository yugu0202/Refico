import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEnvironmentIcons } from "./environment-icons.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
test("同じビルドをstaging→preview→productionへ切り替えて全アイコンとアプリ名を戻せる", () => {
  const dist = mkdtempSync(join(tmpdir(), "refico-icons-"));
  try {
    copyFileSync(join(root, "index.html"), join(dist, "index.html"));
    for (const target of ["staging", "preview", "production"]) {
      prepareEnvironmentIcons(target, root, dist);
      const source =
        target === "production"
          ? join(root, "public")
          : join(root, "public/environments", target);
      for (const asset of [
        "favicon.svg",
        "favicon.ico",
        "apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-maskable-512.png",
        "icons/icon-dark-512.png",
      ]) {
        assert.deepEqual(
          readFileSync(join(dist, asset)),
          readFileSync(join(source, asset)),
        );
      }
      const manifest = JSON.parse(
        readFileSync(join(dist, "manifest.webmanifest"), "utf8"),
      );
      assert.equal(
        manifest.name,
        {
          production: "Refico",
          staging: "Refico ステージング",
          preview: "Refico プレビュー",
        }[target],
      );
      assert.equal(manifest.short_name, manifest.name);
      assert.ok(
        manifest.icons.every((icon) => icon.src.endsWith(`?v=4-${target}`)),
      );
      const html = readFileSync(join(dist, "index.html"), "utf8");
      assert.ok(html.includes(`content="${manifest.name}"`));
      for (const path of [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon.png",
        "manifest.webmanifest",
      ])
        assert.ok(html.includes(`/${path}?v=4-${target}`));
      assert.ok(html.includes("<title>Refico</title>"));
    }
    assert.throws(
      () => prepareEnvironmentIcons("unknown", root, dist),
      /Invalid/,
    );
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
