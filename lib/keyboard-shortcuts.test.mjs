import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  appActionCollision,
  beginShortcutLoad,
  defaultShortcutBindings,
  incomingShortcutDraft,
  interpretRecordingKey,
  isBrowserReservedChord,
  matchShortcutAction,
  settingsSectionOnOpen,
  shortcutDraftIssues,
  shortcutLoadIsCurrent,
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

test("defaults are primary+B, primary+Shift+B, and primary+comma", () => {
  const bindings = defaultShortcutBindings();
  assert.deepEqual(bindings.toggleLeftSidebar.chord, { modifiers: ["primary"], key: "b" });
  assert.deepEqual(bindings.toggleRightSidebar.chord, { modifiers: ["primary", "shift"], key: "b" });
  assert.deepEqual(bindings.openSettings.chord, { modifiers: ["primary"], key: "," });
  for (const binding of Object.values(bindings)) {
    assert.equal(binding.enabled, true);
    assert.equal(isBrowserReservedChord(binding.chord), false);
  }
});

test("matches the platform primary modifier and ignores repeats, fields are irrelevant", () => {
  const bindings = defaultShortcutBindings();
  assert.equal(matchShortcutAction(key({ ctrlKey: true }), bindings, "other"), "toggleLeftSidebar");
  assert.equal(matchShortcutAction(key({ metaKey: true }), bindings, "mac"), "toggleLeftSidebar");
  assert.equal(matchShortcutAction(key({ metaKey: true }), bindings, "other"), null);
  assert.equal(matchShortcutAction(key({ ctrlKey: true, shiftKey: true }), bindings, "other"), "toggleRightSidebar");
  assert.equal(matchShortcutAction(key({ key: ",", ctrlKey: true }), bindings, "other"), "openSettings");
  assert.equal(matchShortcutAction(key({ ctrlKey: true, repeat: true }), bindings, "other"), null);
  assert.equal(shortcutRepeatSuppressed(key({ ctrlKey: true, repeat: true }), bindings, "other"), true);
  assert.equal(matchShortcutAction(key({ ctrlKey: true, isComposing: true }), bindings, "other"), null);
  assert.equal(matchShortcutAction(key({ ctrlKey: true, defaultPrevented: true }), bindings, "other"), null);
  const handled = defaultShortcutBindings();
  handled.toggleLeftSidebar = { ...handled.toggleLeftSidebar, chord: { modifiers: ["primary"], key: "Enter" } };
  assert.equal(matchShortcutAction(key({ key: "Enter", ctrlKey: true, defaultPrevented: true }), handled, "other"), null);
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
  assert.equal(appActionCollision({ modifiers: ["ctrl", "alt", "shift"], key: "n" }), "newSession");
  assert.equal(appActionCollision({ modifiers: ["ctrl", "alt", "meta"], key: "n" }), "newSession");
  assert.equal(appActionCollision({ modifiers: ["primary", "alt", "shift"], key: "n" }), "newSession");
  assert.equal(appActionCollision({ modifiers: ["meta", "alt"], key: "n" }), null);
  assert.equal(appActionCollision({ modifiers: ["ctrl", "alt"], key: "\u0144" }), null);

  assert.equal(appActionCollision({ modifiers: ["primary"], key: "Enter" }), "composerSubmit");
  assert.equal(appActionCollision({ modifiers: ["ctrl"], key: "Enter" }), "composerSubmit");
  assert.equal(appActionCollision({ modifiers: ["ctrl", "shift"], key: "Enter" }), "composerSubmit");
  assert.equal(appActionCollision({ modifiers: ["meta", "shift"], key: "Enter" }), "composerSubmit");
  assert.equal(appActionCollision({ modifiers: ["meta", "alt"], key: "Enter" }), "composerSubmit");
  assert.equal(appActionCollision({ modifiers: ["shift"], key: "Enter" }), null);
  assert.equal(appActionCollision({ modifiers: ["primary"], key: "i" }), "sourceMention");
  assert.equal(appActionCollision({ modifiers: ["meta"], key: "I" }), "sourceMention");
  assert.equal(appActionCollision({ modifiers: ["ctrl", "meta"], key: "i" }), "sourceMention");
  assert.equal(appActionCollision({ modifiers: ["primary", "shift"], key: "i" }), null);
  assert.equal(appActionCollision({ modifiers: ["ctrl", "alt"], key: "i" }), null);
  const submit = defaultShortcutBindings();
  submit.toggleLeftSidebar = { ...submit.toggleLeftSidebar, chord: { modifiers: ["primary"], key: "Enter" } };
  assert.ok(shortcutDraftIssues(submit).some((issue) => issue.collision === "composerSubmit"));
  const mention = defaultShortcutBindings();
  mention.openSettings = { ...mention.openSettings, chord: { modifiers: ["primary"], key: "i" } };
  assert.ok(shortcutDraftIssues(mention).some((issue) => issue.collision === "sourceMention"));
  for (const binding of Object.values(defaultShortcutBindings())) {
    assert.equal(appActionCollision(binding.chord), null);
  }

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

test("a slow load does not replace a newer one, and a dirty draft survives a later payload", () => {
  const generation = { id: 0 };
  const first = beginShortcutLoad(generation);
  const second = beginShortcutLoad(generation);
  assert.equal(shortcutLoadIsCurrent(generation, first), false);
  assert.equal(shortcutLoadIsCurrent(generation, second), true);

  const saved = defaultShortcutBindings();
  const draft = defaultShortcutBindings();
  draft.toggleLeftSidebar = { ...draft.toggleLeftSidebar, chord: { modifiers: ["primary"], key: "k" } };
  const incoming = defaultShortcutBindings();
  incoming.toggleRightSidebar = { ...incoming.toggleRightSidebar, enabled: false };
  const kept = incomingShortcutDraft(saved, draft, incoming);
  assert.equal(kept.draft.toggleLeftSidebar.chord.key, "k");
  assert.equal(kept.saved.toggleRightSidebar.enabled, true);
  const clean = incomingShortcutDraft(saved, saved, incoming);
  assert.equal(clean.draft.toggleRightSidebar.enabled, false);
});

test("opening Settings while it is open keeps the current section", () => {
  assert.equal(settingsSectionOnOpen("models", "general"), "models");
  assert.equal(settingsSectionOnOpen(null, "keyboard"), "keyboard");
});
