import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TextField from "@mui/material/TextField";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme.ts";

// These checks cover emitted label/notch states, not WebKit's actual painting.
for (const state of [
  { name: "empty and blurred", value: "", focused: false, floating: false },
  { name: "empty and focused", value: "", focused: true, floating: true },
  { name: "filled and blurred", value: "0", focused: false, floating: true },
]) {
  test(`outlined labels and notches stay aligned when ${state.name}`, () => {
    for (const field of [
      { label: "金額（円）", type: "number" },
      { label: "店名（任意）" },
      { label: "メモ（任意）", multiline: true },
    ]) {
      const html = renderToStaticMarkup(
        createElement(
          ThemeProvider,
          { theme },
          createElement(TextField, {
            ...field,
            value: state.value,
            focused: state.focused,
          }),
        ),
      );
      assert.match(html, new RegExp(`data-shrink="${state.floating}"`));
      const outline = html.match(/<fieldset[^>]*>(.*?)<\/fieldset>/s)?.[1];
      assert.ok(outline);
      const widths = [...outline.matchAll(/max-width:([^;]+);/g)];
      assert.equal(widths.at(-1)?.[1], state.floating ? "100%" : "0.01px");
      // The workaround must not expose the duplicate legend text or pin width.
      assert.match(outline, /span\{[^}]*opacity:0;/);
      assert.match(
        html,
        /@supports \(-webkit-appearance: none\)\{[^}]* legend\{visibility:visible;/,
      );
    }
  });
}
