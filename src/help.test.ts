import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import {
  helpArticles,
  helpCategories,
  helpPageFromPath,
  findHelpArticle,
  helpBackAction,
} from "./help.ts";

test("使い方の直接URL・末尾スラッシュ・不明な記事を解決し、他のパスとは区別する", () => {
  assert.equal(helpPageFromPath("/help"), "help");
  assert.equal(helpPageFromPath("/help/"), "help");
  assert.equal(helpPageFromPath("/help/record-meal/"), "help/record-meal");
  assert.equal(findHelpArticle("help/record-meal")?.title, "食事を記録する");
  assert.equal(helpPageFromPath("/help/unknown"), "help/unknown");
  assert.equal(findHelpArticle("help/unknown"), undefined);
  for (const path of ["/", "/helpful", "/inventory", "/api/help"])
    assert.equal(helpPageFromPath(path), null);
});

test("一覧と関連記事に孤立・重複・リンク切れがなく、操作図の配信ファイルが存在する", () => {
  const ids = new Set(helpArticles.map((article) => article.id));
  assert.equal(ids.size, helpArticles.length);
  for (const category of helpCategories)
    assert.ok(helpArticles.some((article) => article.category === category));
  for (const article of helpArticles) {
    assert.ok(helpCategories.includes(article.category));
    assert.ok(article.steps.length > 0);
    for (const related of article.related) {
      assert.ok(ids.has(related), `${article.id} -> ${related}`);
      assert.notEqual(article.id, related);
    }
    if (article.image)
      assert.ok(
        existsSync(new URL(`../public${article.image.src}`, import.meta.url)),
      );
  }
});

test("パンくずは説明履歴を積まず一覧へ戻り、一覧の戻るはメニューへの復帰になる", () => {
  assert.deepEqual(
    helpBackAction("help/record-meal", {
      reficoHelpDepth: 1,
      reficoHelpReturn: true,
    }),
    { type: "go", delta: -1 },
  );
  assert.deepEqual(
    helpBackAction("help/make-prepared", {
      reficoHelpDepth: 3,
      reficoHelpReturn: true,
    }),
    { type: "go", delta: -3 },
  );
  assert.deepEqual(
    helpBackAction("help", { reficoHelpDepth: 0, reficoHelpReturn: true }),
    { type: "go", delta: -1 },
  );
});
test("直接開いた記事や一覧の戻るは説明に循環しない", () => {
  assert.deepEqual(helpBackAction("help/record-meal", null), {
    type: "replace",
    page: "help",
  });
  assert.deepEqual(helpBackAction("help", { reficoHelpReturn: false }), {
    type: "replace",
    page: "home",
  });
  assert.deepEqual(
    helpBackAction("help/unknown", { reficoHelpDepth: undefined }),
    { type: "replace", page: "help" },
  );
});
