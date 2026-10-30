import assert from "node:assert/strict";
import test from "node:test";
import { activeTabAfterClose, EXPLORER_TAB_ID, shouldClosePanelAfterTabRemoval } from "./right-panel-tabs.ts";

test("closing the pinned explorer tab does nothing", () => {
  assert.equal(activeTabAfterClose(EXPLORER_TAB_ID, EXPLORER_TAB_ID, [], true), EXPLORER_TAB_ID);
  assert.equal(shouldClosePanelAfterTabRemoval(2, true), false);
});

test("closing the last file tab keeps the panel on the explorer when it is pinned", () => {
  assert.equal(activeTabAfterClose("file:a", "file:a", [null, null], true), EXPLORER_TAB_ID);
  assert.equal(shouldClosePanelAfterTabRemoval(0, true), false);
});

test("closing the last file tab closes the panel when the explorer is on the left", () => {
  assert.equal(activeTabAfterClose("file:a", "file:a", [], false), null);
  assert.equal(shouldClosePanelAfterTabRemoval(0, false), true);
});

test("a remaining file, terminal or subagent tab stays selected", () => {
  assert.equal(activeTabAfterClose("file:a", "file:a", ["file:b", "term:1"], true), "file:b");
  assert.equal(activeTabAfterClose("term:1", "term:1", [null, "term:2", "file:a"], true), "term:2");
  assert.equal(activeTabAfterClose("file:b", "file:a", ["file:b"], true), "file:b");
  assert.equal(shouldClosePanelAfterTabRemoval(1, true), false);
});
