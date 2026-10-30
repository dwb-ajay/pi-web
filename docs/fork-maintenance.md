# Maintaining the folder Workspaces fork

Pi Web remains the stock application. Workspaces is a folder filter over the existing Sessions tree, not a separate session browser.

Narrow fork seams:

- `components/SessionSidebar.tsx` adds Workspaces/Sessions tab selection and the folder-picker entry point while retaining the stock session tree.
- `lib/session-tree.ts` derives the folder-filtered tree from stock session data.
- `lib/session-ui-state-shared.ts` stores explicitly selected folder identities alongside existing sidebar state; the session UI-state API persists that state.
- `components/SettingsPanel.tsx` and `hooks/useFileExplorerPlacement.ts` expose and apply left/right File explorer placement.
- `hooks/useKeyboardShortcuts.ts`, `lib/keyboard-shortcuts.ts`, and `app/api/keyboard-shortcuts/` implement shortcut loading, matching, and persistence.

When updating from upstream, inspect changes to these seams and their adjacent stock session/sidebar code. Follow the upstream merge procedure in the root README, resolve conflicts deliberately, and run the relevant tests plus typecheck, lint, and build before publishing an update.
