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
