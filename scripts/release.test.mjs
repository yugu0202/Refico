import assert from "node:assert/strict";
import test from "node:test";
import { includedPullRequests, nextVersion, releaseDate } from "./release.mjs";

test("release date uses the merge timestamp in Japan, including midnight rollover", () => {
  assert.equal(releaseDate("2026-10-08T14:59:59Z"), "2026.10.8");
  assert.equal(releaseDate("2026-10-08T15:00:00Z"), "2026.10.9");
  assert.equal(releaseDate("2026-12-31T15:00:00Z"), "2027.1.1");
});

test("daily sequence starts at one and uses the largest existing sequence", () => {
  assert.equal(nextVersion("2026.10.9", []), "2026.10.9-1");
  assert.equal(
    nextVersion("2026.10.9", [
      "2026.10.8-99",
      "2026.10.9-2",
      "2026.10.9-10",
      "2026.10.9-beta",
    ]),
    "2026.10.9-11",
  );
});

test("notes include only merged dev PRs introduced by this main merge", () => {
  const pull = (number, commit, base = "dev", merged = true) => ({
    number,
    base: { ref: base },
    merged_at: merged ? "2026-10-08T15:00:00Z" : null,
    merge_commit_sha: commit,
  });
  const ancestors = {
    before: new Set(["old"]),
    after: new Set(["old", "new", "newer"]),
  };
  const pulls = [
    pull(8, "newer"),
    pull(1, "old"),
    pull(4, "new"),
    pull(5, "future"),
    pull(6, "new", "main"),
    pull(7, "new", "dev", false),
  ];
  assert.deepEqual(
    includedPullRequests(pulls, "before", "after", (commit, target) =>
      ancestors[target].has(commit),
    ).map((pr) => pr.number),
    [4, 8],
  );
});
