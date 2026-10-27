# Pi Web downstream fork: Phase 1 seams

This note describes the downstream-only Workspaces, file-placement, and keyboard-shortcut features. The feature modules are not plugins. The fork does not change pi's extension API.

## Integration seams

- **Workspaces** keep the existing Sessions tree. `components/SessionSidebar.tsx` and `components/AppShell.tsx` connect `components/WorkspaceExplorer.tsx`, `lib/workspaces.ts`, and the existing `/api/sessions/ui-state` store. Workspace records use the existing project identity and session metadata. `lib/session-ui-state.ts` and `lib/session-ui-state-shared.ts` are the locked, atomic server persistence boundary; their extension preserves pins, archives, project order, and names.
- **File placement** reuses the existing `FileExplorer`, `TabBar`, and right-panel file viewer. `hooks/useFileExplorerPlacement.ts` stores the browser preference. `components/AppShell.tsx`, `components/SessionSidebar.tsx`, and `components/TabBar.tsx` move the explorer host and pin its right-side tab. `components/SettingsPanel.tsx` exposes the choice. The older left-sidebar `below`/`tab` preference remains independent and applies only when the explorer is on the left.
- **Keyboard shortcuts** use `lib/keyboard-shortcuts.ts` for normalized actions and platform-aware primary modifiers, `lib/keyboard-shortcuts-store.ts` for locked server storage, and `/api/keyboard-shortcuts` for reads and writes. `hooks/useKeyboardShortcuts.ts`, `components/KeyboardShortcutsSettings.tsx`, and `components/SettingsPanel.tsx` implement input and settings UI. Shortcut settings are independent of session UI state and preserve unrelated settings.
- **Shared composition** lives in `components/AppShell.tsx`, `components/SessionSidebar.tsx`, and `components/SettingsPanel.tsx`. These files are narrow integration seams, not isolated module directories. Preserve each feature's callback and state contract during conflict resolution.
- The feature adds `workspace.*`, `filePlacement.*`, and `keyboardShortcuts.*` strings to `lib/i18n/messages/en.ts`, `zh-CN.ts`, and `zh-TW.ts`. Keep all three locales aligned.

## Upstream update procedure

1. Confirm the fork's recorded base branch and the intended upstream revision before fetching or rebasing. The feature branch targets `dwb-ajay/pi-web`'s `main`; do not assume an upstream default branch is the integration base.
2. Fetch upstream into a disposable integration branch. Compare upstream changes in the shared seam files listed above before applying the update. Review changes to session UI state, project/worktree identity, file panel tabs, keyboard handlers, Settings navigation, and i18n.
3. Reapply or merge each feature by its seam. Keep the Workspaces server state in the existing session UI store. Keep shortcut state in its separate locked store. Keep file placement in its existing browser preference convention. Do not move file previews to a new renderer or add runtime containers.
4. Inspect the combined diff for lost session-tree behavior, state overwrite races, file-explorer duplication, stale file-tab close behavior, shortcut collisions, settings reset behavior, and missing locale strings.
5. Run `npm test`, `node_modules/.bin/tsc --noEmit`, and `npm run lint`. Run fixture-only browser paths for both file placements, workspace membership and concurrency, and keyboard recording / persistence in Chromium and Firefox-family browsers where available. Keep session data and screenshots synthetic.
6. Confirm all `@earendil-works/*` packages remain exact-pinned as required by `lib/pi-packages.test.mjs`. Do not run a production build in a live development tree.

## Compatibility checks

The automated regression suites are `lib/workspaces.test.mjs`, `lib/session-ui-state*.test.mjs`, `components/WorkspaceExplorer.test.mjs`, `hooks/useFileExplorerPlacement.test.mjs`, `lib/right-panel-tabs.test.mjs`, `components/explorer-placement*.test.mjs`, `lib/keyboard-shortcuts*.test.mjs`, `app/api/keyboard-shortcuts/route.test.mjs`, and the related AppShell/sidebar/TabBar tests. The actual browser check remains necessary because DOM tests do not exercise browser interception, visual placement, and live state retention.
