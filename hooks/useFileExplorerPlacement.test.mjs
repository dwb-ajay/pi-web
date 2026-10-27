import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./useFileExplorerPlacement.ts", import.meta.url), "utf8");
const script = new Script(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText);
const KEY = "pi-web:file-explorer-placement";

function fixture({ initial = {}, blocked = false, server = false } = {}) {
  const stored = new Map(Object.entries(initial));
  const events = new Map();
  let unsubscribe = null;
  let notifications = 0;
  const storage = {
    getItem(key) { if (blocked) throw new Error("blocked"); return stored.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error("blocked"); stored.set(key, value); },
  };
  const exports = {};
  script.runInNewContext({
    exports,
    require(id) {
      if (id !== "react") throw new Error(`Unexpected import ${id}`);
      return {
        useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          if (server) return getServerSnapshot();
          unsubscribe ??= subscribe(() => { notifications += 1; });
          return getSnapshot();
        },
      };
    },
    ...(!server && {
      window: {
        localStorage: storage,
        addEventListener(type, handler) { events.set(type, handler); },
        removeEventListener(type) { events.delete(type); },
      },
    }),
  });
  return { ...exports, stored, events, get notifications() { return notifications; }, unmount() { unsubscribe?.(); unsubscribe = null; } };
}

test("the server renders right without reading browser storage", () => {
  const store = fixture({ server: true, initial: { [KEY]: "left" } });
  assert.equal(store.useFileExplorerPlacement(), "right");
});

test("a saved left choice is restored and is not the sidebar below/tab key", () => {
  assert.equal(fixture({ initial: { [KEY]: "left" } }).useFileExplorerPlacement(), "left");
  assert.equal(fixture({ initial: { [KEY]: "below", "pi-web:sidebar-files-placement": "tab" } }).useFileExplorerPlacement(), "right");
  assert.equal(fixture().useFileExplorerPlacement(), "right");
});

test("set writes only this key and another tab's write is adopted", () => {
  const store = fixture();
  assert.equal(store.useFileExplorerPlacement(), "right");
  store.setFileExplorerPlacement("left");
  assert.equal(store.stored.get(KEY), "left");
  assert.equal(store.useFileExplorerPlacement(), "left");
  assert.equal(store.notifications, 1);
  store.stored.set(KEY, "right");
  store.events.get("storage")({ key: "pi-web:sidebar-files-placement" });
  assert.equal(store.useFileExplorerPlacement(), "left");
  store.events.get("storage")({ key: KEY });
  assert.equal(store.useFileExplorerPlacement(), "right");
});

test("blocked storage still applies the choice for this page", () => {
  const store = fixture({ blocked: true });
  assert.equal(store.useFileExplorerPlacement(), "right");
  store.setFileExplorerPlacement("left");
  assert.equal(store.useFileExplorerPlacement(), "left");
  assert.equal(store.stored.has(KEY), false);
});
