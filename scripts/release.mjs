import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseDate(mergedAt) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(mergedAt));
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type).value)
    .join(".");
}

export function nextVersion(date, tags) {
  const prefix = `${date}-`;
  const counts = tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .filter((suffix) => /^[1-9]\d*$/.test(suffix))
    .map(Number);
  return `${prefix}${Math.max(0, ...counts) + 1}`;
}

export function includedPullRequests(pulls, before, after, isAncestor) {
  return pulls
    .filter(
      (pr) =>
        pr.merged_at &&
        pr.base.ref === "dev" &&
        pr.merge_commit_sha &&
        isAncestor(pr.merge_commit_sha, after) &&
        !isAncestor(pr.merge_commit_sha, before),
    )
    .sort((a, b) => a.number - b.number);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function isAncestor(commit, target) {
  // With full history checked out, an absent object cannot belong to main.
  // This also handles PRs merged into dev histories that were later replaced.
  if (spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`]).status !== 0)
    return false;
  const result = spawnSync("git", [
    "merge-base",
    "--is-ancestor",
    commit,
    target,
  ]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`Cannot compare commits ${commit} and ${target}`);
}

function api(endpoint, options = []) {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint, ...options], { encoding: "utf8" }),
  );
}

function allPages(endpoint) {
  const values = [];
  for (let page = 1; ; page++) {
    const batch = api(
      `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

export function main() {
  const { pull_request: pr } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const repo = process.env.GITHUB_REPOSITORY;
  if (
    !pr?.merged ||
    pr.base.ref !== "main" ||
    pr.head.ref !== "dev" ||
    pr.head.repo.full_name !== repo
  ) {
    throw new Error(
      "Expected a merged dev → main pull request from this repository",
    );
  }
  const after = pr.merge_commit_sha;
  const parents = git("rev-list", "--parents", "-n", "1", after)
    .split(" ")
    .slice(1);
  // A merge commit preserves dev PR commit identities across releases.
  // Squash/rebase would make ancestry-based exclusion unreliable.
  if (parents.length !== 2) {
    throw new Error(
      "dev → main must use Create a merge commit (not squash/rebase) to enumerate unreleased PRs accurately",
    );
  }
  const before = parents[0];
  const date = releaseDate(pr.merged_at);
  const releases = allPages(`repos/${repo}/releases`);
  const tags = git("tag", "--list").split("\n").filter(Boolean);
  const releaseTags = tags.filter((tag) =>
    /^\d{4}\.\d{1,2}\.\d{1,2}-[1-9]\d*$/.test(tag),
  );
  const existingTag = releaseTags.find(
    (tag) => git("rev-list", "-n", "1", tag) === after,
  );
  if (
    existingTag &&
    releases.some((release) => release.tag_name === existingTag)
  ) {
    console.log(`Release ${existingTag} already exists; skipping.`);
    return;
  }
  const version =
    existingTag ??
    nextVersion(date, [
      ...tags,
      ...releases.map((release) => release.tag_name),
    ]);
  const pulls = includedPullRequests(
    allPages(`repos/${repo}/pulls?state=closed&base=dev`),
    before,
    after,
    isAncestor,
  );
  const body = [
    "## 変更内容",
    "",
    ...pulls.map(
      (pull) => `- ${pull.title.replace(/[\r\n]/g, " ")} (#${pull.number})`,
    ),
    ...(pulls.length ? [] : ["今回取り込まれたdev向けPRはありません。"]),
    "",
    `合流PR: #${pr.number}`,
    `差分: https://github.com/${repo}/compare/${before}...${after}`,
  ].join("\n");
  const release = api(`repos/${repo}/releases`, [
    "--method",
    "POST",
    "-f",
    `tag_name=${version}`,
    "-f",
    `target_commitish=${after}`,
    "-f",
    `name=${version}`,
    "-f",
    `body=${body}`,
    "-F",
    "draft=false",
    "-F",
    "prerelease=false",
  ]);
  console.log(`Created ${release.html_url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
