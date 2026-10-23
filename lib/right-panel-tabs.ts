/** Pinned file-explorer tab. Ordinary close actions must not remove it. */
export const EXPLORER_TAB_ID = "explorer";

export function activeTabAfterClose(
  current: string | null,
  closedId: string,
  fallbacks: Array<string | null | undefined>,
  explorerPinned: boolean,
): string | null {
  if (closedId === EXPLORER_TAB_ID) return current;
  if (current !== closedId) return current;
  for (const id of fallbacks) {
    if (id) return id;
  }
  return explorerPinned ? EXPLORER_TAB_ID : null;
}

/** The file panel closes only when its last closeable tab goes and the explorer is not pinned there. */
export function shouldClosePanelAfterTabRemoval(remainingCloseableTabs: number, explorerPinned: boolean): boolean {
  return remainingCloseableTabs === 0 && !explorerPinned;
}

function showingPinnedExplorer(activeTabId: string | null, panelOpen: boolean, explorerPinned: boolean): boolean {
  return explorerPinned && panelOpen && (activeTabId == null || activeTabId === EXPLORER_TAB_ID);
}

/** What the leaving workspace stores. An open pinned explorer is open, not a closed empty panel. */
export function parkedFilePanel(
  activeTabId: string | null,
  panelOpen: boolean,
  explorerPinned: boolean,
): { activeTabId: string | null; open: boolean } {
  const activeFileId = activeTabId?.startsWith("file:") ? activeTabId : null;
  return {
    activeTabId: activeFileId,
    open: panelOpen && (Boolean(activeFileId) || showingPinnedExplorer(activeTabId, panelOpen, explorerPinned)),
  };
}

/**
 * Panel state after a workspace switch. Null means the current view keeps the
 * panel: a terminal tab, or an open pinned explorer whose destination has no
 * open file panel. A destination that had a file open is applied.
 */
export function filePanelAfterWorkspaceSwitch(
  activeTabId: string | null,
  panelOpen: boolean,
  explorerPinned: boolean,
  restored: { activeTabId: string | null; open: boolean },
): { activeTabId: string | null; panelOpen: boolean } | null {
  const activeFileId = activeTabId?.startsWith("file:") ? activeTabId : null;
  const terminalOwnsPanel = Boolean(
    activeTabId
    && activeTabId !== EXPLORER_TAB_ID
    && !activeFileId
    && !activeTabId.startsWith("agent:"),
  );
  if (terminalOwnsPanel) return null;
  if (showingPinnedExplorer(activeTabId, panelOpen, explorerPinned) && !restored.open) return null;
  return { activeTabId: restored.activeTabId, panelOpen: restored.open };
}
