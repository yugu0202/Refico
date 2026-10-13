import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dateLabel, money } from "../../src/format";
import { sampleState } from "../../src/domain/sample";
import { applyCommand } from "../../src/domain/commands";
const date = "2026-10-13";
async function setup(page: Page, width: number, mode: string) {
  await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z"));
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(
    (mode) => localStorage.setItem("refico-theme", mode),
    mode,
  );
  let state = sampleState(date);
  state = applyCommand(state, {
    type: "meal.create",
    input: {
      date: "2026-10-01",
      kind: "夕食",
      inputs: [],
      prepared: [],
      direct: { cost: 12345678, note: "", place: "" },
    },
  });
  state = applyCommand(state, {
    type: "meal.create",
    input: {
      date: "2026-10-02",
      kind: "夕食",
      inputs: [],
      prepared: [],
      direct: { cost: 0, note: "", place: "" },
    },
  });
  state = applyCommand(state, {
    type: "prepared.create",
    input: {
      name: "テスト料理",
      date,
      servings: 2,
      inputs: [{ productId: state.products[0].id, quantity: 100, unit: "g" }],
    },
  });
  await page.route("**/api/environment", (route) =>
    route.fulfill({ json: { environment: "production" } }),
  );
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: {
        state,
        revision: 1,
        spaces: [{ id: "test", name: "テスト", role: "owner" }],
        spaceId: "test",
        authMode: "test",
        sampleDataEnabled: false,
        user: { name: "テスト", email: "test@example.com" },
      },
    }),
  );
  await page.route("**/api/commands", (route) =>
    route.fulfill({ status: 500, json: { error: "保存テストのエラー" } }),
  );
  await page.goto("/");
  await expect(
    page.locator(".navigation").getByRole("button", { name: /^購入/ }),
  ).toBeVisible();
  return state;
}
async function noOverflow(page: Page) {
  const overflowing = await page
    .locator(
      "html, body, .app-shell, main, .edit-dialog, .MuiDialogContent-root, .cost-calendar",
    )
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.scrollWidth > n.clientWidth + 1)
        .map((n) => n.className),
    );
  expect(overflowing).toEqual([]);
}
for (const width of [320, 375, 600, 601, 1280])
  for (const mode of ["light", "dark"]) {
    test(`${width}px ${mode}: calendar, edit, focus and drafts`, async ({
      page,
    }, testInfo) => {
      await setup(page, width, mode);
      const recorded = page.getByRole("button", {
        name: `2026年${dateLabel("2026-10-01")}、${money(12345678)}`,
      });
      await expect(recorded).toBeVisible();
      await expect(recorded.locator(".calendar-cost")).toHaveText(
        money(12345678),
      );
      await expect(
        page.getByRole("button", {
          name: `2026年${dateLabel("2026-10-02")}、${money(0)}`,
        }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("calendar.png") });
      await noOverflow(page);
      await page
        .locator(".navigation")
        .getByRole("button", { name: "在庫", exact: true })
        .click();
      await page
        .getByRole("button", { name: "白米を編集", exact: true })
        .click();
      const stockEditor = page.getByRole("dialog");
      const content = stockEditor.locator(".MuiDialogContent-root");
      await expect(content).toHaveCSS("padding-top", "20px");
      const heading = (await stockEditor
        .locator(".full-screen-heading")
        .boundingBox())!;
      const firstField = (await content
        .locator(".MuiTextField-root")
        .first()
        .boundingBox())!;
      expect(
        firstField.y - (heading.y + heading.height),
      ).toBeGreaterThanOrEqual(19);
      await page.keyboard.press("Escape");
      await expect(stockEditor).toHaveCount(0);
      await page
        .locator(".navigation")
        .getByRole("button", { name: /^食事/ })
        .click();
      await page.getByLabel("食事の日付").fill(date);
      await page.getByRole("button", { name: "金額を入力" }).click();
      await page.getByLabel("金額（円）").fill("456");
      await page
        .locator(".navigation")
        .getByRole("button", { name: /^購入/ })
        .click();
      await page.getByLabel("購入価格（円）").fill("789");
      const trigger = page
        .getByRole("button", { name: /の購入履歴を編集/ })
        .first();
      await trigger.click();
      const listPosition = await page
        .locator("main")
        .evaluate((node) => node.scrollTop);
      const dialog = page.getByRole("dialog", { name: "購入履歴を編集" });
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      if (width <= 600) expect(Math.round(bounds!.width)).toBe(width);
      if (width > 600) expect(bounds!.width).toBeLessThan(width);
      await noOverflow(page);
      const close = dialog.getByRole("button", { name: "入力を閉じる" });
      const tapArea = await close.boundingBox();
      expect(tapArea!.width).toBeGreaterThanOrEqual(48);
      expect(tapArea!.height).toBeGreaterThanOrEqual(48);
      await close.focus();
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
      const axe = await new AxeBuilder({ page })
        .include(".edit-dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      await dialog.getByRole("button", { name: "この記録を削除" }).click();
      const confirm = page.getByRole("dialog", { name: /削除しますか/ });
      expect((await confirm.boundingBox())!.width).toBeLessThan(width);
      await confirm.getByRole("button", { name: "キャンセル" }).click();
      await page.screenshot({ path: testInfo.outputPath("purchase-edit.png") });
      await page.goBack();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(
        await page.locator("main").evaluate((node) => node.scrollTop),
      ).toBe(listPosition);
      await expect(page.getByLabel("購入価格（円）")).toHaveValue("789");
      await page
        .locator(".navigation")
        .getByRole("button", { name: /^食事/ })
        .click();
      await expect(page.getByLabel("金額（円）")).toHaveValue("456");
      for (const tab of ["料理", "食事"]) {
        await page
          .locator(".navigation")
          .getByRole("button", { name: new RegExp(`^${tab}`) })
          .click();
        await page
          .getByRole("button", { name: /の履歴を編集/ })
          .first()
          .click();
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
    });
  }

for (const mode of ["light", "dark"]) {
  test(`${mode}: enlarged text, keyboard-sized viewport, nested editors and save`, async ({
    page,
  }) => {
    const state = await setup(page, 320, mode);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await noOverflow(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.getByRole("button", { name: "在庫", exact: true }).click();
    const trigger = page.getByRole("button", {
      name: "白米を編集",
      exact: true,
    });
    await trigger.click();
    const editor = page.getByRole("dialog");
    await expect(editor).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await noOverflow(page);
    await page.setViewportSize({ width: 320, height: 400 });
    await editor.locator(".MuiDialogContent-root").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const headingBounds = await editor
      .locator(".full-screen-heading")
      .boundingBox();
    expect(headingBounds!.y).toBeGreaterThanOrEqual(0);
    expect(headingBounds!.y + headingBounds!.height).toBeLessThanOrEqual(400);
    await editor.getByRole("button", { name: "食材の入力を閉じる" }).click();
    await expect(trigger).toBeFocused();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 375, height: 800 });
    await page
      .locator(".navigation")
      .getByRole("button", { name: /^購入/ })
      .click();
    await page
      .getByRole("button", { name: /の購入履歴を編集/ })
      .first()
      .click();
    const purchase = page.getByRole("dialog", { name: "購入履歴を編集" });
    await purchase.getByLabel("購入価格（円）").fill("1000");
    const saveButton = purchase.getByRole("button", { name: "変更を保存" });
    const saveBounds = (await saveButton.boundingBox())!;
    await page.mouse.move(saveBounds.x + 10, saveBounds.y + 10);
    await page.mouse.down();
    await expect
      .poll(() => saveButton.evaluate((node) => node.matches(":active")))
      .toBe(true);
    const contrast = await saveButton.evaluate((node) => {
      const style = getComputedStyle(node);
      const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
      const foreground = rgb(style.color);
      const background = rgb(style.backgroundColor);
      const surface = rgb(
        getComputedStyle(node.closest(".MuiDialog-paper")!).backgroundColor,
      );
      const alpha = background[3] ?? 1;
      const brightness = Number(
        style.filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1,
      );
      const luminance = (channels: number[]) =>
        channels.slice(0, 3).reduce((sum, value, i) => {
          const channel = Math.min(255, value * brightness) / 255;
          const linear =
            channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][i];
        }, 0);
      const ink = luminance(foreground);
      const fill = luminance(
        background
          .slice(0, 3)
          .map((value, i) => value * alpha + surface[i] * (1 - alpha)),
      );
      return (Math.max(ink, fill) + 0.05) / (Math.min(ink, fill) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await purchase.getByRole("button", { name: "変更を保存" }).click();
    await expect(purchase.getByRole("alert")).toHaveText("保存テストのエラー");
    await expect(purchase.getByLabel("購入価格（円）")).toHaveValue("1000");
    await purchase.getByRole("combobox", { name: "食材" }).click();
    await page.getByRole("option", { name: "＋ 食材を追加" }).click();
    await expect(
      page.getByRole("dialog", { name: "食材を追加" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "食材を追加" })).toHaveCount(
      0,
    );
    await expect(purchase).toBeVisible();
    await expect(purchase.getByLabel("購入価格（円）")).toHaveValue("1000");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/commands", async (route) => {
      const { command } = route.request().postDataJSON();
      await pending;
      await route.fulfill({
        json: { state: applyCommand(state, command), revision: 2 },
      });
    });
    await purchase.getByRole("button", { name: "変更を保存" }).click();
    await expect(
      purchase.getByRole("button", { name: "入力を閉じる" }),
    ).toBeDisabled();
    await page.goBack();
    await expect(purchase).toBeVisible();
    release();
    await expect(purchase).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(
      "購入の記録を更新しました",
    );
  });
}
