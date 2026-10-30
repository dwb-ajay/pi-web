# Workspaces

Workspaces is a second view of the stock session tree. The view filters sessions by an explicit list of project keys; it does not import, copy, or move session data. Each selected folder shows all its sessions in normal activity order. Folder selection does not change the current project, session selection, pins, archive state, or file access.

The `workspaceFolders` list lives beside the existing sidebar session UI state in `pi-web-session-state.json`. It stores only `{ key, root }` identities. Keep validation on `/api/cwd/validate`; do not trust a folder key or root supplied by the browser. Use the existing `buildSessionTree` and `SessionTree` for rendering, including empty selected folders. Do not create a parallel session-row implementation.

The Workspaces tab, Sessions tab, and Files tab share the existing sidebar and retain the existing browser placement preference. The file explorer and its left/right placement are independent of Workspaces membership. Keyboard shortcuts use the existing global shortcut registry; the right explorer default is primary+J. Keep saved user-defined bindings intact when changing defaults.

Regression checks:

- `node --test lib/session-ui-state-shared.test.mjs lib/session-ui-state.test.mjs lib/session-tree.test.mjs lib/sidebar-prefs.test.mjs`
- `node --test components/SessionSidebar.tabs.test.mjs components/SessionSidebar.test.mjs`
- `node --test lib/keyboard-shortcuts.test.mjs`
