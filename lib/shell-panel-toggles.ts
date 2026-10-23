/** Shortcuts call this. AppShell registers the live right-panel toggle. */
type PanelToggle = () => void;

let rightPanelToggle: PanelToggle | null = null;

export function registerRightPanelToggle(toggle: PanelToggle): () => void {
  rightPanelToggle = toggle;
  return () => {
    if (rightPanelToggle === toggle) rightPanelToggle = null;
  };
}

export function toggleRightPanel(): void {
  rightPanelToggle?.();
}
