export function shouldKeepSelectedSession<T>(selected: T | null, currentProject: string | null, nextProject: string): boolean {
  return selected !== null && currentProject === nextProject;
}

export function hasCachedWorkspaceSession<T>(sessions: readonly T[], rememberedId: string, idOf: (session: T) => string): boolean {
  return sessions.some((session) => idOf(session) === rememberedId);
}

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
