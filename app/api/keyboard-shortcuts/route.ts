import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  KEYBOARD_SHORTCUT_ACTIONS,
  type KeyboardShortcutAction,
  type ShortcutBindings,
} from "@/lib/keyboard-shortcuts";
import {
  KeyboardShortcutStoreError,
  bindingFromRequest,
  getKeyboardShortcutsPath,
  readKeyboardShortcuts,
  shortcutBindingsPayload,
  writeKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts-store";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof KeyboardShortcutStoreError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error), code: "error" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    return NextResponse.json(shortcutBindingsPayload(readKeyboardShortcuts(getKeyboardShortcutsPath())));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request", code: "forbidden" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json", code: "invalid" }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "invalid" }, { status: 400 });
  }
  try {
    const bindings = bindingsFromBody(body);
    const saved = await writeKeyboardShortcuts(bindings, getKeyboardShortcutsPath());
    return NextResponse.json(shortcutBindingsPayload(saved));
  } catch (error) {
    return errorResponse(error);
  }
}

function bindingsFromBody(body: unknown): ShortcutBindings {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new KeyboardShortcutStoreError(400, "invalid", "Shortcut settings must be an object.");
  }
  const raw = (body as { bindings?: unknown }).bindings;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new KeyboardShortcutStoreError(400, "invalid", "Shortcut bindings must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const bindings = {} as ShortcutBindings;
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    bindings[action] = bindingFromRequest(record[action], action);
  }
  return bindings;
}

export type { KeyboardShortcutAction };
