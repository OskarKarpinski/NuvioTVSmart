import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../../../css/components-37.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*(?:,|\\{)([^}]*)\\}`));
  return match ? match[1] : "";
}

test("focused audio tracks keep readable colours in every selection state", () => {
  const focusedSelected = ruleBody(".player-audio-modal .player-dialog-item.selected.focused");
  assert.match(focusedSelected, /background:\s*var\(--player-secondary\)/);
  assert.match(focusedSelected, /color:\s*var\(--player-on-secondary\)/);
  assert.match(focusedSelected, /border-color:\s*var\(--player-focus-ring\)/);

  const focusedUnselected = ruleBody(
    ".player-audio-modal .player-dialog-item.focused:not(.selected)"
  );
  assert.match(focusedUnselected, /background:\s*transparent/);
  assert.match(focusedUnselected, /color:\s*var\(--player-atv-text-primary\)/);

  const childSelector =
    ".player-audio-modal .player-dialog-item.selected.focused .player-dialog-item-main";
  assert.match(ruleBody(childSelector), /color:\s*var\(--player-on-secondary\)/);
});
