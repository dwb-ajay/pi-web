import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { defaultShortcutBindings } = await jiti.import("./keyboard-shortcuts.ts");
const {
  KeyboardShortcutStoreError,
  readKeyboardShortcuts,
  writeKeyboardShortcuts,
} = await jiti.import("./keyboard-shortcuts-store.ts");

async function tempFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-web-shortcuts-"));
  return { dir, file: path.join(dir, "pi-web-keyboard-shortcuts.json") };
}

test("missing file reads as defaults and a save keeps disabled and unknown fields", async () => {
  const { dir, file } = await tempFile();
  try {
    const defaults = readKeyboardShortcuts(file);
    assert.equal(defaults.toggleLeftSidebar.enabled, true);
    assert.equal(defaults.toggleLeftSidebar.source, "default");

    const custom = defaultShortcutBindings();
    custom.toggleLeftSidebar = { ...custom.toggleLeftSidebar, enabled: false };
    custom.openSettings = { ...custom.openSettings, chord: { modifiers: ["primary"], key: "k" }, source: "custom" };
    await writeKeyboardShortcuts(custom, file);

    const { writeFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(file, "utf8"));
    raw.future = { keep: true };
    raw.bindings.futureAction = { chord: ["primary", "x"] };
    await writeFile(file, JSON.stringify(raw));

    const read = readKeyboardShortcuts(file);
    assert.equal(read.toggleLeftSidebar.enabled, false);
    assert.equal(read.toggleLeftSidebar.source, "custom");
    assert.deepEqual(read.openSettings.chord, { modifiers: ["primary"], key: "k" });
    assert.equal(read.toggleRightSidebar.source, "default");

    const again = defaultShortcutBindings();
    again.toggleRightSidebar = { ...again.toggleRightSidebar, chord: { modifiers: ["primary"], key: "m" }, source: "custom" };
    again.toggleLeftSidebar = read.toggleLeftSidebar;
    again.openSettings = read.openSettings;
    await writeKeyboardShortcuts(again, file);
    const after = JSON.parse(await readFile(file, "utf8"));
    assert.equal(after.future.keep, true);
    assert.deepEqual(after.bindings.futureAction, { chord: ["primary", "x"] });
    assert.equal(after.bindings.toggleLeftSidebar.disabled, true);
    assert.equal(after.bindings.openSettings.chord.join("+"), "primary+k");
    assert.equal(readKeyboardShortcuts(file).toggleLeftSidebar.enabled, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refuses a duplicate save and leaves the file unchanged", async () => {
  const { dir, file } = await tempFile();
  try {
    const bindings = defaultShortcutBindings();
    bindings.openSettings = { ...bindings.openSettings, chord: { modifiers: ["primary"], key: "b" } };
    await assert.rejects(writeKeyboardShortcuts(bindings, file), (error) => {
      assert.ok(error instanceof KeyboardShortcutStoreError);
      assert.equal(error.code, "duplicate");
      return true;
    });
    await assert.rejects(readFile(file, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refuses composer submit and source mention chords", async () => {
  const { dir, file } = await tempFile();
  try {
    for (const chord of [
      { modifiers: ["primary"], key: "Enter" },
      { modifiers: ["ctrl", "shift"], key: "Enter" },
      { modifiers: ["meta", "shift"], key: "Enter" },
      { modifiers: ["primary"], key: "i" },
      { modifiers: ["ctrl", "alt", "shift"], key: "n" },
      { modifiers: ["ctrl", "alt", "meta"], key: "n" },
    ]) {
      const bindings = defaultShortcutBindings();
      bindings.openSettings = { ...bindings.openSettings, chord };
      await assert.rejects(writeKeyboardShortcuts(bindings, file), (error) => {
        assert.equal(error.code, "collision");
        return true;
      });
    }
    await assert.rejects(readFile(file, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refuses the shared new-session collision", async () => {
  const { dir, file } = await tempFile();
  try {
    const bindings = defaultShortcutBindings();
    bindings.toggleLeftSidebar = { ...bindings.toggleLeftSidebar, chord: { modifiers: ["ctrl", "alt"], key: "n" } };
    await assert.rejects(writeKeyboardShortcuts(bindings, file), (error) => {
      assert.equal(error.code, "collision");
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
