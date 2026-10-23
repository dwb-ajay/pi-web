/**
 * Curated workspace view helpers. Membership lives in the session UI store
 * (`lib/session-ui-state-shared.ts`). Catalogue rows come from the existing
 * session list: `messageCount` is the scanner's count of `type: "message"`
 * entries (the same rule as the SDK's displayed session info), not the number
 * of JSONL lines. `modified` is the session file mtime the list already reports.
 */

import { workspaceKeyOf } from "./workspace-memory";

export interface WorkspaceCatalogueSession {
  id: string;
  cwd: string;
  projectRoot?: string | null;
  projectKey?: string | null;
  modified: string;
  name?: string;
  firstMessage: string;
  messageCount: number;
  relation?: { kind: string } | null;
}

/** Subagent transcripts stay inside their parent family, as in the Sessions tree. */
export function isWorkspaceCatalogueSession(session: { relation?: { kind: string } | null }): boolean {
  return session.relation?.kind !== "subagent";
}

/**
 * One project's sessions for Add existing session: newest `modified` first.
 * Equal timestamps keep id order so the popup does not jump. Search matches
 * the name, the first message and the id.
 */
export function workspacePickerSessions<T extends WorkspaceCatalogueSession>(
  sessions: readonly T[],
  projectKey: string,
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  return sessions
    .filter((session) => isWorkspaceCatalogueSession(session) && workspaceKeyOf(session) === projectKey)
    .filter((session) => {
      if (!needle) return true;
      const haystack = `${session.name ?? ""} ${session.firstMessage} ${session.id}`.toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => {
      const byTime = right.modified.localeCompare(left.modified);
      return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
    });
}

/** Every project session the Add existing menu lists, newest first. No row cap. */
export function workspacePickerMenuRows<T extends WorkspaceCatalogueSession>(
  sessions: readonly T[],
  projectKey: string,
  memberIds: ReadonlySet<string>,
): Array<T & { label: string; searchTitle: string; added: boolean }> {
  return workspacePickerSessions(sessions, projectKey, "").map((session) => ({
    ...session,
    label: session.name || session.firstMessage || session.id,
    searchTitle: `${session.id} ${session.cwd}`,
    added: memberIds.has(session.id),
  }));
}

/** Membership order. Missing catalogue rows stay, so a removed file can still be unlisted. Running state is ignored. */
export function orderedWorkspaceSessionIds(sessionIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of sessionIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}
