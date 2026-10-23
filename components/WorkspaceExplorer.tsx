"use client";

import { useState } from "react";
import { getFileName } from "@/lib/file-paths";
import { formatRelativeTime } from "@/lib/i18n/format";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { storedProjectName, type SessionUiState } from "@/lib/session-ui-state-shared";
import type { SessionInfo } from "@/lib/types";
import { workspacePickerMenuRows } from "@/lib/workspaces";
import { SidebarMenu, type SidebarMenuAnchor, type SidebarMenuItem } from "./SidebarMenu";

interface Props {
  sessions: SessionInfo[];
  state: SessionUiState;
  selectedSessionId: string | null;
  runningSessionIds: ReadonlySet<string>;
  query: string;
  onSelectSession: (session: SessionInfo) => void;
  onStartNew: (cwd: string, projectKey: string) => void;
  onAddFolder: () => void;
  onAddSession: (projectKey: string, cwd: string, id: string) => void;
  onRemoveSession: (projectKey: string, id: string) => void;
  onRemoveWorkspace: (projectKey: string) => void;
}

export function workspacePickerMenuItems(
  sessions: SessionInfo[],
  projectKey: string,
  memberIds: readonly string[],
  note: (session: SessionInfo) => string,
  alreadyAdded: string,
): SidebarMenuItem[] {
  return workspacePickerMenuRows(sessions, projectKey, new Set(memberIds)).map((session) => ({
    type: "item",
    id: session.id,
    label: session.label,
    title: session.searchTitle,
    path: true,
    checked: false,
    disabled: session.added,
    disabledReason: session.added ? alreadyAdded : undefined,
    note: note(session),
    onSelect: () => {},
  }));
}

/**
 * Curated workspaces: project membership in stored order. Selecting a row
 * switches the existing chat. Removing a row drops membership only.
 */
export function WorkspaceExplorer({
  sessions,
  state,
  selectedSessionId,
  runningSessionIds,
  query,
  onSelectSession,
  onStartNew,
  onAddFolder,
  onAddSession,
  onRemoveSession,
  onRemoveWorkspace,
}: Props) {
  const { t, locale } = useI18n();
  const isMobile = useIsMobile();
  const [picker, setPicker] = useState<{ projectKey: string; cwd: string; anchor: SidebarMenuAnchor } | null>(null);
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const needle = query.trim().toLowerCase();
  const order = state.workspaceOrder ?? [];
  const workspaces = state.workspaces ?? {};

  const rows = order.filter((key) => {
    const record = workspaces[key];
    if (!record) return false;
    if (!needle) return true;
    const name = storedProjectName(state, key) ?? getFileName(record.cwd);
    if (name.toLowerCase().includes(needle) || record.cwd.toLowerCase().includes(needle)) return true;
    return record.sessionIds.some((id) => {
      const session = byId.get(id);
      const title = session?.name || session?.firstMessage || id;
      return title.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
    });
  });

  const pickerItems: SidebarMenuItem[] = !picker ? [] : workspacePickerMenuItems(
    sessions,
    picker.projectKey,
    workspaces[picker.projectKey]?.sessionIds ?? [],
    (session) => t("workspace.messagesAndEdited", {
      count: session.messageCount,
      edited: formatRelativeTime(session.modified, locale),
    }),
    t("workspace.alreadyAdded"),
  ).map((item) => ({
    ...item,
    onSelect: () => onAddSession(picker.projectKey, picker.cwd, item.id),
  }));

  return (
    <div className="workspace-explorer">
      <div className="workspace-explorer-toolbar">
        <button type="button" className="workspace-explorer-add" onClick={onAddFolder}>
          {t("workspace.addFolder")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="workspace-explorer-empty">{needle ? t("workspace.pickerNoMatch") : t("workspace.empty")}</p>
      ) : rows.map((projectKey) => {
        const record = workspaces[projectKey];
        const name = storedProjectName(state, projectKey) ?? getFileName(record.cwd);
        return (
          <section key={projectKey} className="workspace-card" aria-label={name}>
            <header className="workspace-card-header">
              <div className="workspace-card-title" title={record.cwd}>
                <span className="workspace-card-name">{name}</span>
                <span className="workspace-card-path">{record.cwd}</span>
              </div>
              <button type="button" className="workspace-card-remove" onClick={() => onRemoveWorkspace(projectKey)}>
                {t("workspace.removeWorkspace")}
              </button>
            </header>
            <ul className="workspace-session-list">
              {record.sessionIds.map((id) => {
                const session = byId.get(id);
                const title = session?.name || session?.firstMessage || id;
                const selected = id === selectedSessionId;
                return (
                  <li key={id} className={`workspace-session${selected ? " is-selected" : ""}${runningSessionIds.has(id) ? " is-running" : ""}`}>
                    <button
                      type="button"
                      className="workspace-session-open"
                      disabled={!session}
                      onClick={() => session && onSelectSession(session)}
                    >
                      <span className="workspace-session-title">{title}</span>
                      <span className="workspace-session-meta">
                        {session
                          ? t("workspace.messagesAndEdited", {
                            count: session.messageCount,
                            edited: formatRelativeTime(session.modified, locale),
                          })
                          : t("workspace.missingSession")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="workspace-session-remove"
                      aria-label={t("workspace.removeSession", { title })}
                      onClick={() => onRemoveSession(projectKey, id)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="workspace-card-actions">
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPicker({
                    projectKey,
                    cwd: record.cwd,
                    anchor: { kind: "rect", rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, align: "start" },
                  });
                }}
              >
                {t("workspace.addSession")}
              </button>
              <button type="button" onClick={() => onStartNew(record.cwd, projectKey)}>
                {t("workspace.startSession")}
              </button>
            </div>
          </section>
        );
      })}
      {picker && (
        <SidebarMenu
          open
          anchor={picker.anchor}
          sheet={isMobile}
          ariaLabel={t("workspace.pickerLabel")}
          title={t("workspace.addSession")}
          items={pickerItems.length > 0 ? pickerItems : [{ type: "header", id: "empty", label: needle ? t("workspace.pickerNoMatch") : t("workspace.pickerEmpty") }]}
          filter={{ placeholder: t("workspace.pickerSearch"), emptyLabel: t("workspace.pickerNoMatch"), minChoices: 1 }}
          cancelLabel={t("sidebar.cancel")}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
