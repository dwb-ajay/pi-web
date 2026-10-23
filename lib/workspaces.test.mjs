import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { applySessionUiStateRequest, emptySessionUiState, normalizeSessionUiState, WORKSPACES_MAX_BYTES } = await jiti.import("./session-ui-state-shared.ts");
const { workspacePickerMenuRows, workspacePickerSessions } = await jiti.import("./workspaces.ts");

const session = (id, extra = {}) => ({ id, cwd: "/repo", projectKey: "proj", modified: "2026-01-01T00:00:00.000Z", firstMessage: id, messageCount: 2, ...extra });

test("picker uses project identity, newest modified first, and ignores JSONL-unrelated fields", () => {
  const rows = [
    session("old", { modified: "2026-01-01T00:00:00.000Z", messageCount: 3 }),
    session("new", { modified: "2026-02-01T00:00:00.000Z", messageCount: 9 }),
    session("other", { projectKey: "else", modified: "2026-03-01T00:00:00.000Z" }),
    session("child", { relation: { kind: "subagent" }, modified: "2026-04-01T00:00:00.000Z" }),
    session("tie-b", { modified: "2026-02-01T00:00:00.000Z" }),
  ];
  const picked = workspacePickerSessions(rows, "proj", "");
  assert.deepEqual(picked.map((row) => row.id), ["new", "tie-b", "old"]);
  assert.equal(picked[0].messageCount, 9);
  assert.deepEqual(workspacePickerSessions(rows, "proj", "old").map((row) => row.id), ["old"]);
});

test("workspace membership appends, stays stable, and does not touch pins or project order", () => {
  const start = {
    ...emptySessionUiState(),
    revision: 4,
    sessions: { fam: { pinnedAt: 1 } },
    projectOrder: ["/other"],
    projectNames: { "/other": "Other" },
  };
  const ensured = applySessionUiStateRequest(start, { action: "ensure-workspace", projectKey: "proj", cwd: "/repo" }, 9);
  assert.equal(ensured.changed, true);
  assert.deepEqual(ensured.state.workspaceOrder, ["proj"]);
  assert.deepEqual(ensured.state.workspaces.proj, { cwd: "/repo", sessionIds: [] });
  assert.equal(ensured.state.sessions.fam.pinnedAt, 1);
  assert.deepEqual(ensured.state.projectOrder, ["/other"]);
  assert.equal(ensured.state.revision, 4);

  const again = applySessionUiStateRequest(ensured.state, { action: "ensure-workspace", projectKey: "proj", cwd: "/other-worktree" }, 10);
  assert.equal(again.changed, false);
  assert.equal(again.state.workspaces.proj.cwd, "/repo");

  const added = applySessionUiStateRequest(ensured.state, { action: "add-workspace-sessions", projectKey: "proj", cwd: "/other-worktree", ids: ["a", "b", "a"] }, 11);
  assert.deepEqual(added.state.workspaces.proj.sessionIds, ["a", "b"]);
  assert.equal(added.state.workspaces.proj.cwd, "/repo");
  const replay = applySessionUiStateRequest(added.state, { action: "add-workspace-sessions", projectKey: "proj", cwd: "/repo", ids: ["b", "a"] }, 12);
  assert.equal(replay.changed, false);
  const bottom = applySessionUiStateRequest(added.state, { action: "add-workspace-sessions", projectKey: "proj", cwd: "/repo", ids: ["c"] }, 12);
  assert.deepEqual(bottom.state.workspaces.proj.sessionIds, ["a", "b", "c"]);

  const removed = applySessionUiStateRequest(bottom.state, { action: "remove-workspace-sessions", projectKey: "proj", ids: ["b"] }, 13);
  assert.deepEqual(removed.state.workspaces.proj.sessionIds, ["a", "c"]);
  assert.equal(removed.state.workspaces.proj.cwd, "/repo");
  const restored = applySessionUiStateRequest(removed.state, { action: "add-workspace-sessions", projectKey: "proj", cwd: "/repo", ids: ["b"] }, 14);
  assert.deepEqual(restored.state.workspaces.proj.sessionIds, ["a", "c", "b"]);
});

test("two logical adds of the same id collapse, and a second project appends", () => {
  let state = emptySessionUiState();
  state = applySessionUiStateRequest(state, { action: "add-workspace-sessions", projectKey: "a", cwd: "/a", ids: ["s1"] }, 1).state;
  state = applySessionUiStateRequest(state, { action: "add-workspace-sessions", projectKey: "a", cwd: "/a", ids: ["s1"] }, 2).state;
  state = applySessionUiStateRequest(state, { action: "add-workspace-sessions", projectKey: "b", cwd: "/b", ids: ["s2"] }, 3).state;
  assert.deepEqual(state.workspaceOrder, ["a", "b"]);
  assert.deepEqual(state.workspaces.a.sessionIds, ["s1"]);
  const normalized = normalizeSessionUiState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(normalized.workspaceOrder, ["a", "b"]);
  assert.deepEqual(normalized.workspaces.b, { cwd: "/b", sessionIds: ["s2"] });
});

test("Add existing lists every project session, newest first, and search still finds the oldest", () => {
  const rows = Array.from({ length: 201 }, (_, index) => session(`s${String(index).padStart(3, "0")}`, {
    name: `named-${index}`,
    firstMessage: `opening-${index}`,
    modified: new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 1000).toISOString(),
    messageCount: index + 1,
  }));
  const listed = workspacePickerMenuRows(rows, "proj", new Set(["s200"]));
  assert.equal(listed.length, 201);
  assert.equal(listed[0].id, "s200");
  assert.equal(listed[0].added, true);
  assert.equal(listed[0].messageCount, 201);
  assert.equal(listed.at(-1).id, "s000");
  assert.deepEqual(workspacePickerSessions(rows, "proj", "s000").map((row) => row.id), ["s000"]);
  assert.deepEqual(workspacePickerSessions(rows, "proj", "opening-0").map((row) => row.id), ["s000"]);
  assert.deepEqual(workspacePickerSessions(rows, "proj", "named-200").map((row) => row.id), ["s200"]);
});

test("a workspace write over the byte guard keeps prior membership", () => {
  const kept = applySessionUiStateRequest(emptySessionUiState(), {
    action: "add-workspace-sessions",
    projectKey: "kept",
    cwd: "/kept",
    ids: ["stay"],
  }, 1);
  const hugeId = `h${"a".repeat(800)}`;
  const overflow = applySessionUiStateRequest(kept.state, {
    action: "add-workspace-sessions",
    projectKey: "huge",
    cwd: "/huge",
    ids: Array.from({ length: 500 }, (_, index) => `${hugeId}${index}`),
  }, 2);
  assert.equal(overflow.changed, false);
  assert.deepEqual(overflow.state.workspaces.kept.sessionIds, ["stay"]);
  assert.equal(overflow.state.workspaces.huge, undefined);
  assert.ok(JSON.stringify(overflow.state.workspaces).length < WORKSPACES_MAX_BYTES);

  const longIds = Array.from({ length: 5001 }, (_, index) => `id${index}`);
  const wide = {
    version: 1,
    revision: 1,
    sessions: {},
    projects: {},
    workspaces: {
      first: { cwd: "/first", sessionIds: longIds },
      second: { cwd: "/second", sessionIds: ["tail"] },
    },
    workspaceOrder: ["first", "second"],
  };
  const normalized = normalizeSessionUiState(wide);
  assert.equal(normalized.workspaces.first.sessionIds.length, 5001);
  assert.deepEqual(normalized.workspaces.second.sessionIds, ["tail"]);
  const over = normalizeSessionUiState({
    version: 1,
    revision: 2,
    sessions: {},
    projects: {},
    workspaces: {
      huge: { cwd: "/huge", sessionIds: Array.from({ length: 400 }, (_, index) => `${hugeId}${index}`) },
      kept: { cwd: "/kept", sessionIds: ["stay"] },
    },
    workspaceOrder: ["huge", "kept"],
  });
  assert.equal(over.workspaces.huge.sessionIds.length, 400);
  assert.deepEqual(over.workspaces.kept.sessionIds, ["stay"]);
  const droppedOne = applySessionUiStateRequest(over, {
    action: "remove-workspace-sessions",
    projectKey: "huge",
    ids: [over.workspaces.huge.sessionIds[0]],
  }, 4);
  assert.equal(droppedOne.changed, true);
  assert.equal(droppedOne.state.workspaces.huge.sessionIds.length, 399);
  assert.deepEqual(droppedOne.state.workspaces.kept.sessionIds, ["stay"]);
  const refused = applySessionUiStateRequest(droppedOne.state, {
    action: "add-workspace-sessions",
    projectKey: "kept",
    cwd: "/kept",
    ids: [`${hugeId}more`],
  }, 5);
  assert.equal(refused.changed, false);
  assert.deepEqual(refused.state.workspaces.kept.sessionIds, ["stay"]);

  const shrunk = applySessionUiStateRequest(normalized, {
    action: "remove-workspace-sessions",
    projectKey: "first",
    ids: ["id0"],
  }, 3);
  assert.equal(shrunk.changed, true);
  assert.equal(shrunk.state.workspaces.first.sessionIds.includes("id0"), false);
  assert.deepEqual(shrunk.state.workspaces.second.sessionIds, ["tail"]);
});

test("removing a workspace drops membership only", () => {
  const start = applySessionUiStateRequest(emptySessionUiState(), { action: "add-workspace-sessions", projectKey: "a", cwd: "/a", ids: ["s1"] }, 1).state;
  const removed = applySessionUiStateRequest(start, { action: "remove-workspace", projectKey: "a" }, 2);
  assert.equal(removed.state.workspaces, undefined);
  assert.equal(removed.state.sessions.s1, undefined);
});
