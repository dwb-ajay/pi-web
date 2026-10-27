// Client-safe shortcut rules. The server store and the Settings recorder both
// use this module, so a combination the page would refuse is the same one the
// save route refuses.

export const KEYBOARD_SHORTCUTS_CHANGED_EVENT = "pi-web-keyboard-shortcuts-changed";

export const KEYBOARD_SHORTCUT_ACTIONS = [
  "toggleLeftSidebar",
  "toggleRightSidebar",
  "openSettings",
] as const;

export type KeyboardShortcutAction = (typeof KEYBOARD_SHORTCUT_ACTIONS)[number];

export const SHORTCUT_MODIFIERS = ["primary", "ctrl", "meta", "alt", "shift"] as const;

export type ShortcutModifier = (typeof SHORTCUT_MODIFIERS)[number];

export type ShortcutPlatform = "mac" | "other";

export interface ShortcutChord {
  modifiers: ShortcutModifier[];
  key: string;
}

export interface ShortcutBinding {
  enabled: boolean;
  chord: ShortcutChord;
  /** "custom" once the server file names the action, including a disabled default. */
  source: "default" | "custom";
}

export type ShortcutBindings = Record<KeyboardShortcutAction, ShortcutBinding>;

export const DEFAULT_SHORTCUT_CHORDS: Record<KeyboardShortcutAction, ShortcutChord> = {
  toggleLeftSidebar: { modifiers: ["primary"], key: "b" },
  toggleRightSidebar: { modifiers: ["primary", "shift"], key: "b" },
  openSettings: { modifiers: ["primary"], key: "," },
};

/** App actions this page already owns. A saved shortcut must not take one. */
export const APP_ACTION_IDS = ["newSession", "composerSubmit", "sourceMention"] as const;

export type AppActionId = (typeof APP_ACTION_IDS)[number];

const MODIFIER_ORDER = new Map(SHORTCUT_MODIFIERS.map((modifier, index) => [modifier, index]));
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "Hyper", "Super"]);

export interface ShortcutKeyEvent {
  key: string;
  code?: string | null;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  /** Set when a nearer handler already claimed this keydown. */
  defaultPrevented?: boolean;
}

export function isKeyboardShortcutAction(value: unknown): value is KeyboardShortcutAction {
  return typeof value === "string" && (KEYBOARD_SHORTCUT_ACTIONS as readonly string[]).includes(value);
}

export function shortcutPlatform(source?: { platform?: string; userAgent?: string } | null): ShortcutPlatform {
  const platform = source?.platform ?? "";
  const userAgent = source?.userAgent ?? "";
  if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X|iPhone|iPad|iPod/i.test(userAgent)) return "mac";
  return "other";
}

export function currentShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") return "other";
  return shortcutPlatform(navigator);
}

export function defaultShortcutBindings(): ShortcutBindings {
  return {
    toggleLeftSidebar: { enabled: true, chord: cloneChord(DEFAULT_SHORTCUT_CHORDS.toggleLeftSidebar), source: "default" },
    toggleRightSidebar: { enabled: true, chord: cloneChord(DEFAULT_SHORTCUT_CHORDS.toggleRightSidebar), source: "default" },
    openSettings: { enabled: true, chord: cloneChord(DEFAULT_SHORTCUT_CHORDS.openSettings), source: "default" },
  };
}

export function cloneChord(chord: ShortcutChord): ShortcutChord {
  return { modifiers: [...chord.modifiers], key: chord.key };
}

export function chordKey(chord: ShortcutChord): string {
  return `${[...chord.modifiers].sort((left, right) => (MODIFIER_ORDER.get(left) ?? 0) - (MODIFIER_ORDER.get(right) ?? 0)).join("+")}+${chord.key}`;
}

export function chordsEqual(left: ShortcutChord, right: ShortcutChord): boolean {
  return chordKey(left) === chordKey(right);
}

/**
 * Tokens stored on the server: modifiers in a fixed order, then the key.
 * `primary` is Ctrl on Windows and Linux and Cmd on macOS.
 */
export function chordToTokens(chord: ShortcutChord): string[] {
  return [...chord.modifiers, chord.key];
}

export function chordFromTokens(tokens: readonly string[]): ShortcutChord | null {
  if (tokens.length < 2 || tokens.length > SHORTCUT_MODIFIERS.length + 1) return null;
  const key = normalizeShortcutKey(tokens[tokens.length - 1] ?? "");
  if (!key) return null;
  const modifiers: ShortcutModifier[] = [];
  for (const token of tokens.slice(0, -1)) {
    if (!isModifier(token) || modifiers.includes(token)) return null;
    modifiers.push(token);
  }
  modifiers.sort((left, right) => (MODIFIER_ORDER.get(left) ?? 0) - (MODIFIER_ORDER.get(right) ?? 0));
  if (modifiers.length === 0) return null;
  return { modifiers, key };
}

export function formatShortcutChord(
  chord: ShortcutChord,
  platform: ShortcutPlatform,
  labels: { primaryMac: string; primaryOther: string; ctrl: string; meta: string; alt: string; altMac: string; shift: string; space: string },
): string {
  const modifiers = chord.modifiers.map((modifier) => {
    if (modifier === "primary") return platform === "mac" ? labels.primaryMac : labels.primaryOther;
    if (modifier === "alt") return platform === "mac" ? labels.altMac : labels.alt;
    if (modifier === "ctrl") return labels.ctrl;
    if (modifier === "meta") return labels.meta;
    return labels.shift;
  });
  const key = chord.key === " " ? labels.space : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  return [...modifiers, key].join("+");
}

/**
 * Combinations browsers often keep. Disclosure only: saving one is allowed,
 * and the agreed defaults are not rewritten because a browser might claim them.
 */
export function isBrowserReservedChord(chord: ShortcutChord): boolean {
  const modifiers = new Set(chord.modifiers);
  const primaryOnly = modifiers.size === 1 && modifiers.has("primary");
  const primaryShift = modifiers.size === 2 && modifiers.has("primary") && modifiers.has("shift");
  const reserved = new Set(["w", "t", "n", "q", "r", "l", "p", "f", "d", "h", "j", "s", "o", "u"]);
  if ((primaryOnly || primaryShift) && reserved.has(chord.key)) return true;
  if (chord.key === "f5" && modifiers.size === 0) return true;
  if (modifiers.size === 1 && modifiers.has("alt") && chord.key === "f4") return true;
  return false;
}

/**
 * Chords the existing handlers still accept, on every platform the shared file
 * can mean. New session is Ctrl+Alt+N with any extra Shift or Meta (`primary`
 * is Ctrl on Windows and Linux). Submit is Ctrl/Cmd+Enter with any extra
 * Shift or Alt. Source mention is Ctrl/Cmd+I with neither Alt nor Shift.
 * A typed AltGr character is not N, so it is not a new-session chord.
 */
export function appActionCollision(chord: ShortcutChord): AppActionId | null {
  const modifiers = new Set(chord.modifiers);
  const key = chord.key.toLowerCase();
  const hasCtrl = modifiers.has("ctrl") || modifiers.has("primary");
  const hasCommand = hasCtrl || modifiers.has("meta");
  if (hasCtrl && modifiers.has("alt") && key === "n") return "newSession";
  if (!hasCommand) return null;
  if (key === "enter") return "composerSubmit";
  if (!modifiers.has("alt") && !modifiers.has("shift") && key === "i") return "sourceMention";
  return null;
}

export interface ShortcutDraftIssue {
  action: KeyboardShortcutAction;
  code: "duplicate" | "collision";
  collision?: AppActionId;
}

/** Enabled rows only. A disabled row does not occupy its combination. */
export function shortcutDraftIssues(bindings: ShortcutBindings): ShortcutDraftIssue[] {
  const issues: ShortcutDraftIssue[] = [];
  const seen = new Map<string, KeyboardShortcutAction>();
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const binding = bindings[action];
    if (!binding.enabled) continue;
    const collision = appActionCollision(binding.chord);
    if (collision) issues.push({ action, code: "collision", collision });
    const key = chordKey(binding.chord);
    const previous = seen.get(key);
    if (previous) {
      issues.push({ action: previous, code: "duplicate" });
      issues.push({ action, code: "duplicate" });
    } else {
      seen.set(key, action);
    }
  }
  return issues;
}

/**
 * A load may replace the draft only while it still matches the last save.
 * A recorded combination that has not been saved stays, including when a
 * later payload arrives because the language changed.
 */
export function incomingShortcutDraft(
  saved: ShortcutBindings | null,
  draft: ShortcutBindings | null,
  incoming: ShortcutBindings,
): { saved: ShortcutBindings; draft: ShortcutBindings } {
  if (saved && draft && bindingsDirty(draft, saved)) return { saved, draft };
  return { saved: incoming, draft: incoming };
}

export interface ShortcutLoadGeneration {
  id: number;
}

export function beginShortcutLoad(generation: ShortcutLoadGeneration): number {
  generation.id += 1;
  return generation.id;
}

/** A response applies only when no later load has started. */
export function shortcutLoadIsCurrent(generation: ShortcutLoadGeneration, requestId: number): boolean {
  return generation.id === requestId;
}

export function bindingsDirty(draft: ShortcutBindings, saved: ShortcutBindings): boolean {
  return KEYBOARD_SHORTCUT_ACTIONS.some((action) => {
    const left = draft[action];
    const right = saved[action];
    return left.enabled !== right.enabled || !chordsEqual(left.chord, right.chord);
  });
}

export type RecordingDecision =
  | { type: "ignore" }
  | { type: "cancel" }
  | { type: "exit" }
  | { type: "chord"; chord: ShortcutChord };

/**
 * One keydown while a replacement is being recorded. Escape cancels. Tab exits
 * so focus can move. Repeats, IME, and modifier-only keys do not change the draft.
 */
export function interpretRecordingKey(event: ShortcutKeyEvent, platform: ShortcutPlatform): RecordingDecision {
  if (event.key === "Escape") return { type: "cancel" };
  if (event.key === "Tab") return { type: "exit" };
  if (event.repeat || event.isComposing || event.key === "Process" || event.key === "Unidentified") {
    return { type: "ignore" };
  }
  const chord = chordFromKeyEvent(event, platform);
  return chord ? { type: "chord", chord } : { type: "ignore" };
}

export function chordFromKeyEvent(event: ShortcutKeyEvent, platform: ShortcutPlatform): ShortcutChord | null {
  if (event.isComposing || event.key === "Process" || event.key === "Unidentified") return null;
  if (MODIFIER_KEYS.has(event.key) || event.key === "Dead") return null;
  const key = normalizeShortcutKey(event.key);
  if (!key) return null;
  const modifiers: ShortcutModifier[] = [];
  if (platform === "mac") {
    if (event.metaKey) modifiers.push("primary");
    if (event.ctrlKey) modifiers.push("ctrl");
  } else {
    if (event.ctrlKey) modifiers.push("primary");
    if (event.metaKey) modifiers.push("meta");
  }
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey) modifiers.push("shift");
  if (modifiers.length === 0) return null;
  return { modifiers, key };
}

/**
 * The action whose enabled combination matches this keydown. Repeats never
 * match, so holding a key cannot toggle a panel again. Extra modifiers fail
 * the match, which keeps AltGr (Ctrl+Alt that types a character) from firing
 * a primary shortcut.
 */
export function matchShortcutAction(
  event: ShortcutKeyEvent,
  bindings: ShortcutBindings,
  platform: ShortcutPlatform,
): KeyboardShortcutAction | null {
  if (event.repeat || event.isComposing || event.key === "Process" || event.defaultPrevented) return null;
  const chord = chordFromKeyEvent(event, platform);
  if (!chord) return null;
  const key = chordKey(chord);
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const binding = bindings[action];
    if (binding.enabled && chordKey(binding.chord) === key) return action;
  }
  return null;
}

/** True when the keydown would match if it were not a repeat. */
export function shortcutRepeatSuppressed(
  event: ShortcutKeyEvent,
  bindings: ShortcutBindings,
  platform: ShortcutPlatform,
): boolean {
  if (!event.repeat) return false;
  return matchShortcutAction({ ...event, repeat: false }, bindings, platform) !== null;
}

let recording = false;

export function setKeyboardShortcutRecording(active: boolean): void {
  recording = active;
}

export function isKeyboardShortcutRecording(): boolean {
  return recording;
}

/**
 * Opening Settings while it is already open must keep the mounted page.
 * A new section value would be a different open, not a second open.
 */
export function settingsSectionOnOpen<T extends string>(
  current: T | null,
  requested: T,
): T {
  return current ?? requested;
}

function isModifier(value: string): value is ShortcutModifier {
  return (SHORTCUT_MODIFIERS as readonly string[]).includes(value);
}

function normalizeShortcutKey(key: string): string | null {
  if (!key || key.length > 32 || MODIFIER_KEYS.has(key)) return null;
  if (key === "Escape" || key === "Tab" || key === "Dead" || key === "Process" || key === "Unidentified") return null;
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) return key.toLowerCase();
  if (key.length === 1) return key.toLowerCase();
  return key;
}
