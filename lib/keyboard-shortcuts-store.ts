import { mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { serializeByKey } from "./key-serializer";
import {
  KEYBOARD_SHORTCUT_ACTIONS,
  appActionCollision,
  chordFromTokens,
  chordToTokens,
  cloneChord,
  defaultShortcutBindings,
  isKeyboardShortcutAction,
  shortcutDraftIssues,
  type KeyboardShortcutAction,
  type ShortcutBinding,
  type ShortcutBindings,
  type ShortcutChord,
} from "./keyboard-shortcuts";
import { readRegularFileText } from "./regular-file";

// Shortcut customizations live in their own file beside pi's settings, not in
// the session UI store and not in per-browser storage. Writes are serialized,
// locked, and replaced atomically. A file that does not parse is never
// overwritten with defaults.

const MAX_BYTES = 64 * 1024;
const FILE_NAME = "pi-web-keyboard-shortcuts.json";
const QUEUE_KEY: symbol = Symbol.for("pi-web:keyboard-shortcuts-write-queue");

const LOCK_OPTIONS = {
  realpath: false,
  stale: 10_000,
  retries: { retries: 10, factor: 2, minTimeout: 25, maxTimeout: 500 },
  onCompromised: (error: Error) => {
    console.warn(`[pi-web] the keyboard shortcut lock was compromised: ${error.message}`);
  },
};

export class KeyboardShortcutStoreError extends Error {
  readonly status: number;
  readonly code: "invalid" | "duplicate" | "collision" | "corrupt" | "locked";

  constructor(status: number, code: KeyboardShortcutStoreError["code"], message: string) {
    super(message);
    this.name = "KeyboardShortcutStoreError";
    this.status = status;
    this.code = code;
  }
}

export interface StoredShortcutBinding {
  disabled?: boolean;
  chord?: string[];
}

export interface KeyboardShortcutFile {
  version: 1;
  bindings: Partial<Record<KeyboardShortcutAction, StoredShortcutBinding>>;
  /** Top-level fields a newer build may have written. */
  extras: Record<string, unknown>;
  /** Binding ids this build does not own. */
  unknownBindings: Record<string, unknown>;
}

export function getKeyboardShortcutsPath(agentDir = getAgentDir()): string {
  return join(agentDir, FILE_NAME);
}

export function readKeyboardShortcuts(path = getKeyboardShortcutsPath()): ShortcutBindings {
  return resolveShortcutFile(readShortcutFile(path)).bindings;
}

export function writeKeyboardShortcuts(
  update: ShortcutBindings,
  path = getKeyboardShortcutsPath(),
): Promise<ShortcutBindings> {
  const issues = shortcutDraftIssues(update);
  const duplicate = issues.find((issue) => issue.code === "duplicate");
  if (duplicate) {
    return Promise.reject(new KeyboardShortcutStoreError(400, "duplicate", "That combination is already used by another shortcut."));
  }
  const collision = issues.find((issue) => issue.code === "collision");
  if (collision) {
    return Promise.reject(new KeyboardShortcutStoreError(400, "collision", "That combination is already used by another Pi Web action."));
  }
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    if (appActionCollision(update[action].chord) && update[action].enabled) {
      return Promise.reject(new KeyboardShortcutStoreError(400, "collision", "That combination is already used by another Pi Web action."));
    }
  }

  return serializeByKey(QUEUE_KEY, path, async () => {
    let written: KeyboardShortcutFile | null = null;
    await withLock(path, () => {
      const next = applyShortcutUpdate(readShortcutFile(path), update);
      writePrivateFileAtomicSync(path, `${JSON.stringify(serializeShortcutFile(next), null, 2)}\n`);
      written = next;
    });
    return resolveShortcutFile(written ?? emptyShortcutFile()).bindings;
  });
}

export function resolveShortcutFile(file: KeyboardShortcutFile): { bindings: ShortcutBindings; customized: boolean } {
  const bindings = defaultShortcutBindings();
  let customized = false;
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const stored = file.bindings[action];
    if (!stored) continue;
    customized = true;
    const chord = stored.chord ? chordFromTokens(stored.chord) : cloneChord(bindings[action].chord);
    if (stored.chord && !chord) {
      throw new KeyboardShortcutStoreError(500, "corrupt", `Invalid shortcut for ${action}.`);
    }
    bindings[action] = {
      enabled: stored.disabled !== true,
      chord: chord ?? bindings[action].chord,
      source: "custom",
    };
  }
  return { bindings, customized };
}

function readShortcutFile(path: string): KeyboardShortcutFile {
  const text = readRegularFileText(path, MAX_BYTES);
  if (text === undefined) return emptyShortcutFile();
  return parseShortcutFile(text);
}

export function parseShortcutFile(text: string): KeyboardShortcutFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new KeyboardShortcutStoreError(500, "corrupt", "Shortcut settings could not be parsed.");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new KeyboardShortcutStoreError(500, "corrupt", "Shortcut settings must be an object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== undefined && record.version !== 1) {
    throw new KeyboardShortcutStoreError(500, "corrupt", "Unsupported shortcut settings version.");
  }
  const bindingsRaw = record.bindings ?? {};
  if (bindingsRaw === null || typeof bindingsRaw !== "object" || Array.isArray(bindingsRaw)) {
    throw new KeyboardShortcutStoreError(500, "corrupt", "Shortcut bindings must be an object.");
  }
  const bindings: KeyboardShortcutFile["bindings"] = {};
  const unknownBindings: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(bindingsRaw)) {
    if (!isKeyboardShortcutAction(id)) {
      unknownBindings[id] = value;
      continue;
    }
    bindings[id] = parseStoredBinding(id, value);
  }
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "version" || key === "bindings" || key === "__proto__") continue;
    extras[key] = value;
  }
  return { version: 1, bindings, extras, unknownBindings };
}

function parseStoredBinding(action: KeyboardShortcutAction, value: unknown): StoredShortcutBinding {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new KeyboardShortcutStoreError(500, "corrupt", `Invalid shortcut for ${action}.`);
  }
  const record = value as Record<string, unknown>;
  const stored: StoredShortcutBinding = {};
  if (record.disabled !== undefined) {
    if (typeof record.disabled !== "boolean") {
      throw new KeyboardShortcutStoreError(500, "corrupt", `Invalid shortcut for ${action}.`);
    }
    stored.disabled = record.disabled;
  }
  if (record.chord !== undefined) {
    if (!Array.isArray(record.chord) || record.chord.some((token) => typeof token !== "string")) {
      throw new KeyboardShortcutStoreError(500, "corrupt", `Invalid shortcut for ${action}.`);
    }
    if (!chordFromTokens(record.chord)) {
      throw new KeyboardShortcutStoreError(500, "corrupt", `Invalid shortcut for ${action}.`);
    }
    stored.chord = [...record.chord];
  }
  return stored;
}

export function bindingFromRequest(value: unknown, action: KeyboardShortcutAction): ShortcutBinding {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new KeyboardShortcutStoreError(400, "invalid", `Invalid shortcut for ${action}.`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== "boolean" || !Array.isArray(record.chord) || record.chord.some((token) => typeof token !== "string")) {
    throw new KeyboardShortcutStoreError(400, "invalid", `Invalid shortcut for ${action}.`);
  }
  const chord = chordFromTokens(record.chord);
  if (!chord) throw new KeyboardShortcutStoreError(400, "invalid", `Invalid shortcut for ${action}.`);
  return { enabled: record.enabled, chord, source: "custom" };
}

function applyShortcutUpdate(file: KeyboardShortcutFile, update: ShortcutBindings): KeyboardShortcutFile {
  const bindings: KeyboardShortcutFile["bindings"] = { ...file.bindings };
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const binding = update[action];
    const isDefault = binding.enabled && sameChord(binding.chord, defaultShortcutBindings()[action].chord);
    if (isDefault) delete bindings[action];
    else bindings[action] = storedFromBinding(action, binding);
  }
  return { ...file, version: 1, bindings };
}

function storedFromBinding(action: KeyboardShortcutAction, binding: ShortcutBinding): StoredShortcutBinding {
  const stored: StoredShortcutBinding = {};
  if (!binding.enabled) stored.disabled = true;
  if (!sameChord(binding.chord, defaultShortcutBindings()[action].chord)) {
    stored.chord = chordToTokens(binding.chord);
  }
  return stored;
}

function sameChord(left: ShortcutChord, right: ShortcutChord): boolean {
  return chordToTokens(left).join("\0") === chordToTokens(right).join("\0");
}

function serializeShortcutFile(file: KeyboardShortcutFile): Record<string, unknown> {
  const bindings: Record<string, unknown> = { ...file.unknownBindings };
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const stored = file.bindings[action];
    if (stored) bindings[action] = stored;
  }
  return { version: file.version, ...file.extras, bindings };
}

function emptyShortcutFile(): KeyboardShortcutFile {
  return { version: 1, bindings: {}, extras: {}, unknownBindings: {} };
}

async function withLock(path: string, write: () => void): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(path, LOCK_OPTIONS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new KeyboardShortcutStoreError(503, "locked", "Shortcut settings are busy.");
    }
    throw error;
  }
  try {
    write();
  } finally {
    await release();
  }
}

export function shortcutBindingsPayload(bindings: ShortcutBindings): {
  version: 1;
  bindings: Record<KeyboardShortcutAction, { enabled: boolean; chord: string[]; source: ShortcutBinding["source"] }>;
} {
  return {
    version: 1,
    bindings: Object.fromEntries(KEYBOARD_SHORTCUT_ACTIONS.map((action) => {
      const binding = bindings[action];
      return [action, { enabled: binding.enabled, chord: chordToTokens(binding.chord), source: binding.source }];
    })) as Record<KeyboardShortcutAction, { enabled: boolean; chord: string[]; source: ShortcutBinding["source"] }>,
  };
}

/** Kept so a corrupt file can be set aside by a later repair, not by a save. */
export function corruptShortcutBackupPath(path: string): string {
  return `${path}.corrupt-${Date.now()}`;
}

export function moveCorruptShortcutFile(path: string): void {
  try {
    renameSync(path, corruptShortcutBackupPath(path));
  } catch {
    // A failed backup must not become a successful overwrite.
  }
}
