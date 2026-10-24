"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfigButton } from "./SettingsUi";
import { useI18n } from "@/hooks/useI18n";
import {
  KEYBOARD_SHORTCUT_ACTIONS,
  KEYBOARD_SHORTCUTS_CHANGED_EVENT,
  bindingsDirty,
  chordFromTokens,
  currentShortcutPlatform,
  defaultShortcutBindings,
  formatShortcutChord,
  incomingShortcutDraft,
  interpretRecordingKey,
  isBrowserReservedChord,
  setKeyboardShortcutRecording,
  shortcutDraftIssues,
  type KeyboardShortcutAction,
  type ShortcutBindings,
} from "@/lib/keyboard-shortcuts";

interface ShortcutPayload {
  version: 1;
  bindings: Record<KeyboardShortcutAction, { enabled: boolean; chord: string[]; source: "default" | "custom" }>;
}

export function KeyboardShortcutsSettings() {
  const { t } = useI18n();
  const platform = currentShortcutPlatform();
  const [saved, setSaved] = useState<ShortcutBindings | null>(null);
  const [draft, setDraft] = useState<ShortcutBindings | null>(null);
  const [recording, setRecording] = useState<KeyboardShortcutAction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const recordButtonRef = useRef<HTMLButtonElement | null>(null);
  const recordingRef = useRef<KeyboardShortcutAction | null>(null);

  const labels = {
    primaryMac: t("keyboardShortcuts.mod.cmd"),
    primaryOther: t("keyboardShortcuts.mod.ctrl"),
    ctrl: t("keyboardShortcuts.mod.ctrl"),
    meta: t("keyboardShortcuts.mod.cmd"),
    alt: t("keyboardShortcuts.mod.alt"),
    altMac: t("keyboardShortcuts.mod.option"),
    shift: t("keyboardShortcuts.mod.shift"),
    space: t("keyboardShortcuts.mod.space"),
  };

  const savedRef = useRef<ShortcutBindings | null>(null);
  const draftRef = useRef<ShortcutBindings | null>(null);
  savedRef.current = saved;
  draftRef.current = draft;
  const tRef = useRef(t);
  tRef.current = t;

  const bindingsFromPayload = useCallback((payload: ShortcutPayload): ShortcutBindings => {
    const next = defaultShortcutBindings();
    for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
      const row = payload.bindings[action];
      const chord = chordFromTokens(row.chord) ?? next[action].chord;
      next[action] = { enabled: row.enabled, chord, source: row.source };
    }
    return next;
  }, []);

  const applyPayload = useCallback((payload: ShortcutPayload) => {
    const next = bindingsFromPayload(payload);
    setSaved(next);
    setDraft(next);
  }, [bindingsFromPayload]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/keyboard-shortcuts", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as ShortcutPayload & { error?: string };
        if (!response.ok) throw new Error(body.error || tRef.current("keyboardShortcuts.loadFailed"));
        if (cancelled) return;
        const next = incomingShortcutDraft(savedRef.current, draftRef.current, bindingsFromPayload(body));
        setSaved(next.saved);
        setDraft(next.draft);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : tRef.current("keyboardShortcuts.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [bindingsFromPayload]);

  const stopRecording = useCallback((restoreFocus: boolean) => {
    recordingRef.current = null;
    setRecording(null);
    setKeyboardShortcutRecording(false);
    if (restoreFocus) recordButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const decision = interpretRecordingKey(event, platform);
      if (decision.type === "exit") {
        stopRecording(false);
        return;
      }
      if (event.isComposing || event.key === "Process" || event.key === "Unidentified") return;
      event.preventDefault();
      event.stopPropagation();
      if (decision.type === "cancel") {
        stopRecording(true);
        return;
      }
      if (decision.type === "ignore" || !recordingRef.current) return;
      const action = recordingRef.current;
      setDraft((current) => current && ({
        ...current,
        [action]: { ...current[action], chord: decision.chord, source: "custom" },
      }));
      stopRecording(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [platform, recording, stopRecording]);

  useEffect(() => () => setKeyboardShortcutRecording(false), []);

  const beginRecording = (action: KeyboardShortcutAction, button: HTMLButtonElement) => {
    recordButtonRef.current = button;
    recordingRef.current = action;
    setRecording(action);
    setKeyboardShortcutRecording(true);
    setSaveError(null);
    setJustSaved(false);
  };

  const save = async () => {
    if (!draft || shortcutDraftIssues(draft).length > 0) return;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      const response = await fetch("/api/keyboard-shortcuts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bindings: Object.fromEntries(KEYBOARD_SHORTCUT_ACTIONS.map((action) => [action, {
            enabled: draft[action].enabled,
            chord: [...draft[action].chord.modifiers, draft[action].chord.key],
          }])),
        }),
      });
      const body = await response.json() as ShortcutPayload & { error?: string };
      if (!response.ok) {
        setSaveError(body.error || t("keyboardShortcuts.saveFailed"));
        return;
      }
      applyPayload(body);
      setJustSaved(true);
      window.dispatchEvent(new Event(KEYBOARD_SHORTCUTS_CHANGED_EVENT));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("keyboardShortcuts.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <p role="alert" className="settings-general-error">{loadError}</p>;
  }
  if (!draft || !saved) {
    return <p className="settings-general-description">{t("keyboardShortcuts.loading")}</p>;
  }

  const issues = shortcutDraftIssues(draft);
  const dirty = bindingsDirty(draft, saved);

  return (
    <div className="settings-general">
      <h2 className="settings-general-heading">{t("keyboardShortcuts.title")}</h2>
      <p className="settings-general-description">{t("keyboardShortcuts.description")}</p>
      <p className="settings-general-description">{t("keyboardShortcuts.browserReserved")}</p>
      <div className="keyboard-shortcut-list">
        {KEYBOARD_SHORTCUT_ACTIONS.map((action) => {
          const binding = draft[action];
          const issue = issues.find((item) => item.action === action);
          const reserved = binding.enabled && isBrowserReservedChord(binding.chord);
          const recordingThis = recording === action;
          return (
            <div key={action} className="keyboard-shortcut-row">
              <span className="keyboard-shortcut-label">{t(`keyboardShortcuts.action.${action}`)}</span>
              <button
                type="button"
                className={`keyboard-shortcut-record${recordingThis ? " is-recording" : ""}`}
                aria-pressed={recordingThis}
                aria-label={t("keyboardShortcuts.record")}
                onClick={(event) => beginRecording(action, event.currentTarget)}
              >
                {recordingThis
                  ? t("keyboardShortcuts.recording")
                  : formatShortcutChord(binding.chord, platform, labels)}
              </button>
              <ConfigButton
                type="button"
                variant="secondary"
                size="small"
                aria-pressed={!binding.enabled}
                onClick={() => {
                  setJustSaved(false);
                  setDraft((current) => current && ({
                    ...current,
                    [action]: { ...current[action], enabled: !current[action].enabled },
                  }));
                }}
              >
                {binding.enabled ? t("keyboardShortcuts.disable") : t("keyboardShortcuts.enable")}
              </ConfigButton>
              {!binding.enabled && <span className="keyboard-shortcut-note">{t("keyboardShortcuts.disabled")}</span>}
              {recordingThis && <span className="keyboard-shortcut-note">{t("keyboardShortcuts.recordingHint")}</span>}
              {issue?.code === "duplicate" && <span role="alert" className="keyboard-shortcut-note is-error">{t("keyboardShortcuts.duplicate")}</span>}
              {issue?.code === "collision" && <span role="alert" className="keyboard-shortcut-note is-error">{t("keyboardShortcuts.collision")}</span>}
              {reserved && !issue && <span className="keyboard-shortcut-note">{t("keyboardShortcuts.reservedWarning")}</span>}
            </div>
          );
        })}
      </div>
      {dirty && <p className="settings-general-description">{t("keyboardShortcuts.unsaved")}</p>}
      <div className="keyboard-shortcut-actions">
        <ConfigButton
          type="button"
          variant="secondary"
          onClick={() => {
            setJustSaved(false);
            setSaveError(null);
            setDraft(defaultShortcutBindings());
          }}
        >
          {t("keyboardShortcuts.restoreDefaults")}
        </ConfigButton>
        <ConfigButton type="button" disabled={!dirty || saving || issues.length > 0} onClick={() => void save()}>
          {saving ? t("keyboardShortcuts.saving") : t("keyboardShortcuts.save")}
        </ConfigButton>
      </div>
      {saveError && <p role="alert" className="settings-general-error">{saveError}</p>}
      {justSaved && !dirty && <p className="settings-general-description">{t("keyboardShortcuts.saved")}</p>}
    </div>
  );
}
