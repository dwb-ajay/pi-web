import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  appActionCollision,
  defaultShortcutBindings,
  interpretRecordingKey,
  isBrowserReservedChord,
  matchShortcutAction,
  settingsSectionOnOpen,
  shortcutDraftIssues,
  shortcutRepeatSuppressed,
} = await jiti.import("./keyboard-shortcuts.ts");

const key = (overrides) => ({
  key: "b",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  ...overrides,
});

test("defaults are primary+B, primary+J, and primary+comma", () => {
  const bindings = defaultShortcutBindings();
  assert.deepEqual(bindings.toggleLeftSidebar.chord, { modifiers: ["primary"], key: "b" });
  assert.deepEqual(bindings.toggleRightSidebar.chord, { modifiers: ["primary"], key: "j" });
  assert.deepEqual(bindings.openSettings.chord, { modifiers: ["primary"], key: "," });
  for (const binding of Object.values(bindings)) {
    assert.equal(binding.enabled, true);
    assert.equal(isBrowserReservedChord(binding.chord), binding === bindings.toggleRightSidebar);
  }
});

test("matches the platform primary modifier and ignores repeats, fields are irrelevant", () => {
  const bindings = defaultShortcutBindings();
  assert.equal(matchShortcutAction(key({ ctrlKey: true }), bindings, "other"), "toggleLeftSidebar");
  assert.equal(matchShortcutAction(key({ metaKey: true }), bindings, "mac"), "toggleLeftSidebar");
  assert.equal(matchShortcutAction(key({ metaKey: true }), bindings, "other"), null);
  assert.equal(matchShortcutAction(key({ ctrlKey: true, key: "j" }), bindings, "other"), "toggleRightSidebar");
  assert.equal(matchShortcutAction(key({ key: ",", ctrlKey: true }), bindings, "other"), "openSettings");
  assert.equal(matchShortcutAction(key({ ctrlKey: true, repeat: true }), bindings, "other"), null);
  assert.equal(shortcutRepeatSuppressed(key({ ctrlKey: true, repeat: true }), bindings, "other"), true);
  assert.equal(matchShortcutAction(key({ ctrlKey: true, isComposing: true }), bindings, "other"), null);
});

test("AltGr does not match a primary shortcut and does not count as Ctrl+Alt+N text", () => {
  const bindings = defaultShortcutBindings();
  assert.equal(matchShortcutAction(key({ key: "b", ctrlKey: true, altKey: true }), bindings, "other"), null);
  assert.equal(matchShortcutAction(key({ key: "ń", ctrlKey: true, altKey: true }), bindings, "other"), null);
});

test("refuses duplicates and the new-session collision, and only warns on browser-reserved chords", () => {
  const bindings = defaultShortcutBindings();
  bindings.openSettings = { ...bindings.openSettings, chord: { modifiers: ["primary"], key: "b" } };
  assert.ok(shortcutDraftIssues(bindings).some((issue) => issue.code === "duplicate"));

  bindings.openSettings = { ...bindings.openSettings, enabled: false };
  assert.equal(shortcutDraftIssues(bindings).length, 0);

  const collision = defaultShortcutBindings();
  collision.toggleLeftSidebar = { ...collision.toggleLeftSidebar, chord: { modifiers: ["primary", "alt"], key: "n" } };
  assert.equal(appActionCollision(collision.toggleLeftSidebar.chord), "newSession");
  assert.ok(shortcutDraftIssues(collision).some((issue) => issue.code === "collision"));
  assert.equal(appActionCollision({ modifiers: ["ctrl", "alt"], key: "n" }), "newSession");
  assert.equal(appActionCollision({ modifiers: ["meta", "alt"], key: "n" }), null);

  assert.equal(isBrowserReservedChord({ modifiers: ["primary"], key: "w" }), true);
  const reserved = defaultShortcutBindings();
  reserved.toggleLeftSidebar = { ...reserved.toggleLeftSidebar, chord: { modifiers: ["primary"], key: "w" } };
  assert.equal(shortcutDraftIssues(reserved).length, 0);
});

test("recording cancels on Escape, exits on Tab, and ignores repeats and IME", () => {
  assert.equal(interpretRecordingKey(key({ key: "Escape" }), "other").type, "cancel");
  assert.equal(interpretRecordingKey(key({ key: "Tab" }), "other").type, "exit");
  assert.equal(interpretRecordingKey(key({ key: "Tab", shiftKey: true }), "other").type, "exit");
  assert.equal(interpretRecordingKey(key({ ctrlKey: true, repeat: true }), "other").type, "ignore");
  assert.equal(interpretRecordingKey(key({ key: "Process", ctrlKey: true, isComposing: true }), "other").type, "ignore");
  const recorded = interpretRecordingKey(key({ key: "K", ctrlKey: true }), "other");
  assert.equal(recorded.type, "chord");
  if (recorded.type === "chord") assert.deepEqual(recorded.chord, { modifiers: ["primary"], key: "k" });
  const mac = interpretRecordingKey(key({ key: "k", metaKey: true }), "mac");
  if (mac.type === "chord") assert.deepEqual(mac.chord, { modifiers: ["primary"], key: "k" });
});

test("opening Settings while it is open keeps the current section", () => {
  assert.equal(settingsSectionOnOpen("models", "general"), "models");
  assert.equal(settingsSectionOnOpen(null, "keyboard"), "keyboard");
});
