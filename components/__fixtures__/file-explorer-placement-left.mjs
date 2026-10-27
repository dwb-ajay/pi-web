export const FILE_EXPLORER_PLACEMENT_STORAGE_KEY = "pi-web:file-explorer-placement";
export const FILE_EXPLORER_PLACEMENT_DEFAULT = "right";

export function parseFileExplorerPlacement(raw) {
  return raw === "left" ? "left" : FILE_EXPLORER_PLACEMENT_DEFAULT;
}

export function setFileExplorerPlacement() {}

export function useFileExplorerPlacement() {
  return "left";
}
