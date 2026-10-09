import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Select assets at deployment time: dev is a staging Worker Preview, and
// Cloudflare's build command is shared by all deployment targets.
export function prepareEnvironmentIcons(target, directory, assetsDirectory) {
  if (!["production", "staging", "preview"].includes(target))
    throw new Error("Invalid icon environment");
  const label = {
    production: "Refico",
    staging: "Refico ステージング",
    preview: "Refico プレビュー",
  }[target];
  const source =
    target === "production"
      ? join(directory, "public")
      : join(directory, "public/environments", target);
  for (const file of [
    "favicon.svg",
    "favicon.ico",
    "favicon-dark.svg",
    "favicon-dark.ico",
    "apple-touch-icon.png",
    "apple-touch-icon-dark.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-dark-192.png",
    "icons/icon-dark-512.png",
    "icons/icon-maskable-512.png",
    "icons/icon-maskable-dark-512.png",
  ]) {
    mkdirSync(join(assetsDirectory, file, ".."), { recursive: true });
    copyFileSync(join(source, file), join(assetsDirectory, file));
  }
  const manifest = JSON.parse(
    readFileSync(join(directory, "public/manifest.webmanifest"), "utf8"),
  );
  manifest.name = label;
  manifest.short_name = label;
  for (const icon of manifest.icons)
    icon.src = icon.src.replace(/\?.*$/, `?v=4-${target}`);
  writeFileSync(
    join(assetsDirectory, "manifest.webmanifest"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const htmlPath = join(assetsDirectory, "index.html");
  const html = readFileSync(htmlPath, "utf8")
    .replace(
      /(href="\/(?:favicon\.(?:ico|svg)|apple-touch-icon\.png|manifest\.webmanifest))(?:\?[^"\s]*)?"/g,
      `$1?v=4-${target}"`,
    )
    .replace(
      /(<meta name="apple-mobile-web-app-title" content=")[^"]*("\s*\/?>)/,
      `$1${label}$2`,
    );
  writeFileSync(htmlPath, html);
}
