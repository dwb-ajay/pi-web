import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-shortcuts-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET, PUT } = await jiti.import("./route.ts");

function put(body, headers = { host: "localhost", "Content-Type": "application/json" }) {
  return PUT(new Request("http://localhost/api/keyboard-shortcuts", {
    method: "PUT",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

const payload = (overrides = {}) => ({
  bindings: {
    toggleLeftSidebar: { enabled: true, chord: ["primary", "b"] },
    toggleRightSidebar: { enabled: true, chord: ["primary", "shift", "b"] },
    openSettings: { enabled: true, chord: ["primary", ","] },
    ...overrides,
  },
});

test("saves on the server and a failed save is not success", async () => {
  const initial = await (await GET()).json();
  assert.equal(initial.bindings.toggleLeftSidebar.source, "default");

  const saved = await (await put(payload({
    toggleLeftSidebar: { enabled: false, chord: ["primary", "b"] },
  }))).json();
  assert.equal(saved.bindings.toggleLeftSidebar.enabled, false);
  assert.equal(saved.bindings.toggleLeftSidebar.source, "custom");

  const file = path.join(agentDir, "pi-web-keyboard-shortcuts.json");
  const before = await readFile(file, "utf8");
  const rejected = await put(payload({
    openSettings: { enabled: true, chord: ["primary", "b"] },
    toggleLeftSidebar: { enabled: true, chord: ["primary", "b"] },
  }));
  assert.equal(rejected.status, 400);
  const body = await rejected.json();
  assert.equal(body.code, "duplicate");
  assert.equal(typeof body.error, "string");
  assert.equal(await readFile(file, "utf8"), before);

  const again = await (await GET()).json();
  assert.equal(again.bindings.toggleLeftSidebar.enabled, false);
});
