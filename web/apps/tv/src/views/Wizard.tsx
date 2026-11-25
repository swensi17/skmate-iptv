import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, isBack } from "@skmate/ui";
import { applyLanguage, t, type Key } from "../i18n";
import { LANGUAGES } from "../i18n/languages";
import logo from "../assets/skmate-logo.png";
import { SourceForm } from "./SourceForm";
import { readPlaylistFile } from "../state/localFiles";
import type { Settings } from "../state/settings";
import { SettingRow } from "./SettingRow";
import { EntryRow } from "./EntryRow";
import "./player-wizard.css";

export interface WizardResult {
  name: string | null; // null: a guest, or the profile already exists
  guest: boolean;
  settings: Partial<Settings>;
  playlist: { kind: "url"; url: string } | { kind: "file"; name: string; text: string } | { kind: "demo" } | { kind: "none" };
}

type Step = "welcome" | "display" | "profile" | "playlist" | "ready";

interface Props {
  settings: Settings;
  /** An existing viewer re-running the setup keeps their profile: the name step is left out. */
  hasProfile: boolean;
  /** The settings change on screen as the viewer chooses (theme, language), so the choice can be seen at once. */
  onPreview: (s: Settings) => void;
  onFinish: (r: WizardResult) => void;
  onCancel?: () => void;
}

/**
 * The first run, as in the phone version: a welcome, the look, who is watching, the playlist (M3U link or Xtream
 * Codes login), and a "ready". No questionnaire: the app starts with sensible defaults and everything is in Settings.
 * Every step is one centred column: the title, a line under it, the choices, and the buttons in one fixed order.
 */
export function Wizard({ settings, hasProfile, onPreview, onFinish, onCancel }: Props) {
  const steps: Step[] = ["welcome", "display", ...(hasProfile ? [] : ["profile" as const]), "playlist", "ready"];
  const [at, setAt] = useState(0);
  const step = steps[at] as Step;
  const [s, setS] = useState<Settings>(settings);
  const [name, setName] = useState("");
  const [guest, setGuest] = useState(false);
  const [url, setUrl] = useState("");
  const [choice, setChoice] = useState<"url" | "file" | "demo" | "none">("none");
  // A file chosen on this step: read now, kept until the setup ends (checked to hold channels first).
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);

  const change = (next: Settings | ((cur: Settings) => Settings)) => {
    setS((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      onPreview(value);
      applyLanguage(value.language);
      return value;
    });
  };
  const go = (d: number) => setAt((n) => Math.max(0, Math.min(steps.length - 1, n + d)));

  useEffect(() => {
    focusFirst(document, step === "welcome" ? "wz-lang" : step === "display" ? "wz-theme" : step === "profile" ? "wz-name" : step === "playlist" ? "wz-kind-m3u" : "wz-finish");
  }, [step]);

  // Back goes a step back; on the first step it does nothing (the setup is not skipped by accident).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e)) return;
      // A panel open over the setup (typing a value) takes Back first: one step back at a time.
      const modals = document.querySelectorAll("[data-modal]");
      if (modals[modals.length - 1] !== root.current) return;
      e.stopPropagation();
      e.preventDefault();
      if (at > 0) go(-1); else onCancel?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [at]);
  // Closed (a redo from the settings): the focus goes to the screen under it, never nowhere.
  useEffect(() => () => {
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(".content [data-focus]:not(input)")?.focus();
    }, 0);
  }, []);

  const root = useRef<HTMLDivElement>(null);
  const finish = () => {
    onFinish({
      name: guest || hasProfile ? null : name.trim(),
      guest: guest && !hasProfile,
      settings: { language: s.language, theme: s.theme, uiScale: s.uiScale },
      playlist: choice === "url" ? { kind: "url", url } : choice === "file" && file ? { kind: "file", ...file } : choice === "demo" ? { kind: "demo" } : { kind: "none" },
    });
  };

  const title: Record<Step, string> = {
    welcome: t("wzWelcomeTitle"), display: t("wzDisplayTitle"), profile: t("wzProfileTitle"),
    playlist: t("wzPlaylistTitle"), ready: t("wzReadyTitle", { name: guest || hasProfile || name.trim() === "" ? "" : name.trim() }).replace(", !", "!").replace(" !", "!"),
  };
  const sub: Record<Step, Key> = {
    welcome: "wzWelcomeSub", display: "wzDisplaySub", profile: "wzProfileSub", playlist: "wzPlaylistSub", ready: "wzReadySub",
  };

  return (
    <div class="wizard" data-modal ref={root}>
      <div class="wz-top">
        <img class="wz-logo" src={logo} alt="skmate" />
        {/* Where the viewer is, once and in words: "Шаг 2 из 5". Numbered circles beside it said the same twice. */}
        <div class="wz-progress">
          <span class="wz-count">{t("wzStepOf", { n: at + 1, total: steps.length })}</span>
        </div>
      </div>

      {/* One centred column. A step taller than the screen scrolls here instead of pushing its buttons off the screen. */}
      <div class="wz-body">
        <div class={`wz-main wz-${step}`} key={step}>
          <h1 class="wz-title">{title[step]}</h1>
          <p class="wz-sub">{t(sub[step])}</p>

          {step === "ready" ? null : (
            <div class="wz-content">
              {step === "welcome" ? (
                <SettingRow<Settings["language"]> id="wz-lang" title="setLanguage" value={s.language} onPick={(language) => change({ ...s, language })}
                  options={[{ value: "auto" as const, label: t("langAuto") }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]} compact />
              ) : null}

              {step === "display" ? (
                <>
                  <SettingRow<Settings["theme"]> id="wz-theme" title="settingsTheme" value={s.theme} onPick={(theme) => change({ ...s, theme })}
                    options={[{ value: "system", label: t("themeSystem") }, { value: "dark", label: t("themeDark") }, { value: "light", label: t("themeLight") }]} />
                  <SettingRow id="wz-scale" title="setUiScale" value={s.uiScale} onPick={(uiScale) => change({ ...s, uiScale })}
                    options={[80, 90, 100].map((n) => ({ value: n as Settings["uiScale"], label: t("percent", { n }) }))} />
                </>
              ) : null}

              {step === "profile" ? (
                <EntryRow id="wz-name" title={t("welcomeName")} value={name} entryHint={t("wzProfileSub")}
                  onDone={(v) => { setName(v); setGuest(false); if (v.trim() !== "") setTimeout(() => focusFirst(document, "wz-next"), 0); }} />
              ) : null}

              {step === "playlist" ? (
                <>
                  <SourceForm idPrefix="wz" addLabel={t("wzNext")} onSubmit={(link) => { setUrl(link); setChoice("url"); go(1); return null; }}
                    onFile={async (name, text) => {
                      if (!readPlaylistFile(name, text).ok) return t("srcFileBad");
                      setFile({ name, text }); setChoice("file"); go(1); return null;
                    }} />
                  <div class="about-note">{t("aboutDisclaimer")}</div>
                </>
              ) : null}
            </div>
          )}

          {/* Always the same order: Back on the left, the other ways on in the middle, the main step on the right. */}
          <div class="wz-actions">
            {at > 0 ? <button class="btn" data-focus="wz-back" onClick={() => go(-1)}>{t("wzBack")}</button> : null}
            {step === "welcome" ? <button class="btn primary" data-focus="wz-start" onClick={() => go(1)}>{t("wzStart")}</button> : null}
            {step === "display" ? <button class="btn primary" data-focus="wz-next" onClick={() => go(1)}>{t("wzNext")}</button> : null}
            {step === "profile" ? (
              <>
                <button class="btn" data-focus="wz-guest" onClick={() => { setGuest(true); go(1); }}>{t("welcomeGuest")}</button>
                <button class="btn primary" data-focus="wz-next" onClick={() => { if (name.trim() !== "") { setGuest(false); go(1); } else focusFirst(document, "wz-name"); }}>{t("wzNext")}</button>
              </>
            ) : null}
            {step === "playlist" ? (
              <>
                <button class="btn" data-focus="wz-demo" onClick={() => { setChoice("demo"); go(1); }}>{t("wzDemo")}</button>
                <button class="btn" data-focus="wz-skip" onClick={() => { setChoice("none"); go(1); }}>{t("wzSkip")}</button>
              </>
            ) : null}
            {step === "ready" ? <button class="btn primary" data-focus="wz-finish" onClick={finish}>{t("wzFinish")}</button> : null}
          </div>
        </div>
      </div>
      <div class="wz-hints">{t("wzHints")}</div>
    </div>
  );
}
