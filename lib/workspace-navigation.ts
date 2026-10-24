export type WorkspaceRestoreResult<T> =
  | { kind: "empty" }
  | { kind: "missing" }
  | { kind: "drifted" }
  | { kind: "restore"; session: T };

export function resolveWorkspaceRestore<T>(
  sessions: readonly T[],
  rememberedId: string,
  projectKey: string,
  idOf: (session: T) => string,
  workspaceKeyOf: (session: T) => string,
): WorkspaceRestoreResult<T> {
  const session = sessions.find((item) => idOf(item) === rememberedId);
  if (!session) return { kind: "missing" };
  if (workspaceKeyOf(session) !== projectKey) return { kind: "drifted" };
  return { kind: "restore", session };
}
