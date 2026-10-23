import { useSyncExternalStore } from "react";

/** Where the file explorer lives. Right is the default: a pinned tab in the file panel. Left keeps the sidebar's below/tab choice. */
export type FileExplorerPlacement = "left" | "right";

export const FILE_EXPLORER_PLACEMENT_STORAGE_KEY = "pi-web:file-explorer-placement";
export const FILE_EXPLORER_PLACEMENT_DEFAULT: FileExplorerPlacement = "right";

export function parseFileExplorerPlacement(raw: string | null): FileExplorerPlacement {
  return raw === "left" ? "left" : FILE_EXPLORER_PLACEMENT_DEFAULT;
}

function readStoredPlacement(): FileExplorerPlacement {
  try {
    return parseFileExplorerPlacement(window.localStorage.getItem(FILE_EXPLORER_PLACEMENT_STORAGE_KEY));
  } catch {
    return FILE_EXPLORER_PLACEMENT_DEFAULT;
  }
}

let placement: FileExplorerPlacement | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): FileExplorerPlacement {
  if (placement === null) placement = readStoredPlacement();
  return placement;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== FILE_EXPLORER_PLACEMENT_STORAGE_KEY) return;
  const next = readStoredPlacement();
  if (next === placement) return;
  placement = next;
  notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    placement = readStoredPlacement();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setFileExplorerPlacement(next: FileExplorerPlacement): void {
  if (next === getSnapshot()) return;
  placement = next;
  try {
    window.localStorage.setItem(FILE_EXPLORER_PLACEMENT_STORAGE_KEY, next);
  } catch {
    // Applies in memory even if the browser cannot save it.
  }
  notify();
}

export function useFileExplorerPlacement(): FileExplorerPlacement {
  return useSyncExternalStore(subscribe, getSnapshot, () => FILE_EXPLORER_PLACEMENT_DEFAULT);
}
