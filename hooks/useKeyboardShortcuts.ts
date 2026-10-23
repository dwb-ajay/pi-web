"use client";

import { useEffect, useRef } from "react";
import {
  KEYBOARD_SHORTCUTS_CHANGED_EVENT,
  chordFromTokens,
  currentShortcutPlatform,
  beginShortcutLoad,
  defaultShortcutBindings,
  isKeyboardShortcutRecording,
  matchShortcutAction,
  shortcutLoadIsCurrent,
  shortcutRepeatSuppressed,
  type KeyboardShortcutAction,
  type ShortcutBindings,
} from "@/lib/keyboard-shortcuts";

// ---------------------------------------------------------------------------
// Module-level registry — ChatWindow registers the abort handler here so that
// the global Esc listener in AppShell can call it without prop-drilling.
// ---------------------------------------------------------------------------
let globalAbortHandler: (() => void) | null = null;

/**
 * Register (or clear) the abort handler for the global Esc shortcut.
 * Call this from ChatWindow whenever agentRunning or handleAbort changes.
 */
export function registerAbortHandler(handler: (() => void) | null): void {
  globalAbortHandler = handler;
}

/**
 * The global Esc shortcut: stops the running agent, unless the key belongs to
 * something else. Typed into a textarea or input, it is that field's (ChatInput
 * has its own Esc logic). Marked handled already (`defaultPrevented`), it was
 * something nearer's: Settings, a menu or a viewer that closed on it. Those
 * listen on `document` or below and run before this one on `window`, and
 * closing them must not stop a run as well. Returns whether it stopped the
 * agent.
 */
export function handleGlobalEscape(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || !globalAbortHandler) return false;

  const tag = (event.target as HTMLElement | null)?.tagName;
  // Let textarea/input handle Esc internally (ChatInput menus / stop).
  if (tag === "TEXTAREA" || tag === "INPUT") return false;

  event.preventDefault();
  globalAbortHandler();
  return true;
}

/**
 * Whether a keydown is the Ctrl+Alt+N "new session" shortcut.
 *
 * The letter decides (`event.key`), so the shortcut follows the layout. Two
 * platforms bend that:
 * - macOS treats Option as a character-input modifier: `Option+N` is a dead
 *   key (`˜`) in the U.S., ABC and British layouts, and Chrome reports
 *   `key === "Dead"` with `ctrlKey`/`altKey` intact (#1335). A dead key types
 *   nothing yet, so the physical key (`code === "KeyN"`) decides there.
 * - Windows reports AltGr as Ctrl+Alt. When the combination types a character
 *   (Polish AltGr+N is `ń`), that `key` is the user's text: matching `code`
 *   alone would swallow it and open a session instead.
 */
export function isNewSessionShortcut(event: {
  key: string;
  code?: string | null;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  if (!event.ctrlKey || !event.altKey) return false;
  if (event.key.toLowerCase() === "n") return true;
  return event.key === "Dead" && event.code === "KeyN";
}

// ---------------------------------------------------------------------------
// Hook: global keyboard shortcuts
// ---------------------------------------------------------------------------

interface UseGlobalKeyboardShortcutsOptions {
  /** Called when Ctrl+Alt+N is pressed. Receives current cwd. */
  onNewSession?: (cwd: string) => void;
  /** The currently selected project directory (sidebar cwd). */
  activeCwd?: string | null;
  /** Independent of the right sidebar. The layout owns what the toggle does. */
  onToggleLeftSidebar?: () => void;
  /** Independent of the left sidebar. The layout owns what the toggle does. */
  onToggleRightSidebar?: () => void;
  /** Opens Settings. A second press while it is open must not reset the page. */
  onOpenSettings?: () => void;
}

/**
 * Register global keyboard shortcuts for the application.
 *
 * Shortcuts handled here:
 *   Esc          – stop the running agent (via module-level abort handler)
 *   Ctrl+Alt+N   – create a new session in the active project directory
 *                  (see `isNewSessionShortcut()` for macOS and AltGr)
 *   primary+B    – toggle the left sidebar (Cmd on macOS, Ctrl elsewhere)
 *   primary+Shift+B – toggle the right sidebar
 *   primary+,    – open Settings
 *
 * The three configurable shortcuts also fire while a text field has focus.
 * They do not fire while a replacement is being recorded, and a held key
 * does not fire them again. Escape and Ctrl+Alt+N are not configurable here.
 *
 * Note: Esc inside <textarea> or <input> is deliberately NOT handled here.
 * ChatInput manages its own Esc logic (closing slash / @ file menus, stopping
 * the agent when no menu is open) because it needs intimate knowledge of menu
 * state that is local to that component. Nor is an Esc something nearer
 * already handled (see `handleGlobalEscape()`).
 */
export function useGlobalKeyboardShortcuts(
  options: UseGlobalKeyboardShortcutsOptions,
): void {
  const { onNewSession, activeCwd, onToggleLeftSidebar, onToggleRightSidebar, onOpenSettings } = options;
  const bindingsRef = useRef<ShortcutBindings>(defaultShortcutBindings());
  const loadGeneration = useRef({ id: 0 });
  const platform = currentShortcutPlatform();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const requestId = beginShortcutLoad(loadGeneration.current);
      void fetch("/api/keyboard-shortcuts", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const body = await response.json() as {
            bindings?: Record<KeyboardShortcutAction, { enabled: boolean; chord: string[]; source: "default" | "custom" }>;
          };
          if (cancelled || !shortcutLoadIsCurrent(loadGeneration.current, requestId) || !body.bindings) return;
          const next = defaultShortcutBindings();
          for (const action of Object.keys(next) as KeyboardShortcutAction[]) {
            const row = body.bindings[action];
            if (!row) continue;
            const chord = chordFromTokens(row.chord);
            if (!chord) continue;
            next[action] = { enabled: row.enabled, chord, source: row.source };
          }
          bindingsRef.current = next;
        })
        .catch(() => {
          // A failed load keeps the last known bindings, or the defaults.
        });
    };
    load();
    const onChanged = () => load();
    const onFocus = () => load();
    window.addEventListener(KEYBOARD_SHORTCUTS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener(KEYBOARD_SHORTCUTS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (isKeyboardShortcutRecording()) return;

      // ---- Esc: stop agent ----
      if (e.key === "Escape") {
        handleGlobalEscape(e);
        return;
      }

      // ---- Ctrl+Alt+N: new session ----
      if (isNewSessionShortcut(e)) {
        if (!activeCwd || !onNewSession) return;
        e.preventDefault();
        onNewSession(activeCwd);
        return;
      }

      if (e.defaultPrevented) return;
      if (shortcutRepeatSuppressed(e, bindingsRef.current, platform)) {
        e.preventDefault();
        return;
      }
      const action = matchShortcutAction(e, bindingsRef.current, platform);
      if (!action) return;
      e.preventDefault();
      if (action === "toggleLeftSidebar") onToggleLeftSidebar?.();
      else if (action === "toggleRightSidebar") onToggleRightSidebar?.();
      else onOpenSettings?.();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCwd, onNewSession, onOpenSettings, onToggleLeftSidebar, onToggleRightSidebar, platform]);
}
