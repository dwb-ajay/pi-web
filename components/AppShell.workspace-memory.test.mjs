import assert from "node:assert/strict";
import test from "node:test";
import { hasCachedWorkspaceSession, resolveWorkspaceRestore } from "../lib/workspace-navigation.ts";

const session = (id, projectKey, cwd = projectKey) => ({ id, projectKey, cwd });
const idOf = (item) => item.id;
const projectOf = (item) => item.projectKey;

test("a missing remembered session does not fall back to another session", () => {
  const sessions = [session("other-last", "/project-1"), session("project-2-last", "/project-2")];
  assert.deepEqual(resolveWorkspaceRestore(sessions, "deleted", "/project-1", idOf, projectOf), { kind: "missing" });
});

test("a remembered session that moved projects is rejected", () => {
  const sessions = [session("remembered", "/project-2")];
  assert.deepEqual(resolveWorkspaceRestore(sessions, "remembered", "/project-1", idOf, projectOf), { kind: "drifted" });
});

test("a stale catalogue does not claim a remembered session is missing", () => {
  const staleCatalogue = [session("other", "/project-1")];
  assert.equal(hasCachedWorkspaceSession(staleCatalogue, "remembered", idOf), false);
  assert.equal(hasCachedWorkspaceSession([session("remembered", "/project-1")], "remembered", idOf), true);
});

test("a valid remembered session restores across worktrees of the same project", () => {
  const remembered = session("remembered", "/project-1", "/project-1-worktree");
  const result = resolveWorkspaceRestore([remembered], "remembered", "/project-1", idOf, projectOf);
  assert.deepEqual(result, { kind: "restore", session: remembered });
});
