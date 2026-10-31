import { useEffect, useState } from "preact/hooks";
import { focusFirst, isBack } from "@skmate/ui";
import { applyLanguage, t, type Key } from "../i18n";
import logo from "../assets/skmate-logo.png";
import { SourceForm } from "./SourceForm";
import type { Settings } from "../state/settings";
import { Illustration, type Pic } from "./Illustration";
import { SettingRow } from "./SettingRow";

export interface WizardResult {
  name: string | null; // null: a guest, or the profile already exists
  guest: boolean;
  settings: Partial<Settings>;
  playlist: { kind: "url"; url: string } | { kind: "demo" } | { kind: "none" };
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
 */
export function Wizard({ settings, hasProfile, onPreview, onFinish, onCancel }: Props) {
  const steps: Step[] = ["welcome", "display", ...(hasProfile ? [] : ["profile" as const]), "playlist", "ready"];
  const [at, setAt] = useState(0);
  const step = steps[at] as Step;
  const [s, setS] = useState<Settings>(settings);
  const [name, setName] = useState("");
  const [guest, setGuest] = useState(false);
  const [url, setUrl] = useState("");
  const [choice, setChoice] = useState<"url" | "demo" | "none">("none");

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
      e.stopPropagation();
      e.preventDefault();
      if (at > 0) go(-1); else onCancel?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [at]);

  const finish = () => {
    onFinish({
      name: guest || hasProfile ? null : name.trim(),
      guest: guest && !hasProfile,
      settings: { language: s.language, theme: s.theme, uiScale: s.uiScale },
      playlist: choice === "url" ? { kind: "url", url } : choice === "demo" ? { kind: "demo" } : { kind: "none" },
    });
  };

  const pic: Pic = step === "welcome" || step === "display" ? "tv" : step === "profile" ? "face" : step === "playlist" ? "link" : "done";
  const title: Record<Step, string> = {
    welcome: t("wzWelcomeTitle"), display: t("wzDisplayTitle"), profile: t("wzProfileTitle"),
    playlist: t("wzPlaylistTitle"), ready: t("wzReadyTitle", { name: guest || hasProfile || name.trim() === "" ? "" : name.trim() }).replace(", !", "!").replace(" !", "!"),
  };
  const sub: Record<Step, string> = {
    welcome: t("wzWelcomeSub"), display: t("wzDisplaySub"), profile: t("wzProfileSub"),
    playlist: t("wzPlaylistSub"), ready: t("wzReadySub"),
  };

  return (
    <div class="wizard" data-modal>
      <div class="wz-top">
        <img class="wz-logo" src={logo} alt="skmate" />
        <div class="wz-steps" aria-label={t("wzStepOf", { n: at + 1, total: steps.length })}>
          {steps.map((_, i) => <span key={i} class={`wz-dot${i === at ? " on" : i < at ? " done" : ""}`}>{i + 1}</span>)}
        </div>
      </div>

      <div class="wz-body" key={step}>
        <Illustration pic={pic} />
        <h1 class="wz-title">{title[step]}</h1>
        <p class="wz-sub">{sub[step]}</p>

        <div class="wz-content">
          {step === "welcome" ? (
            <SettingRow<Settings["language"]> id="wz-lang" title="setLanguage" value={s.language} onPick={(language) => change({ ...s, language })}
              options={[{ value: "auto", label: t("langAuto") }, { value: "ru", label: t("langRu") }, { value: "en", label: t("langEn") }]} />
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
            <input class="field" data-focus="wz-name" value={name} placeholder={t("welcomeName")}
              onInput={(e) => { setName((e.currentTarget as HTMLInputElement).value); setGuest(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() !== "") go(1); }} />
          ) : null}

          {step === "playlist" ? (
            <>
              <SourceForm idPrefix="wz" addLabel={t("wzNext")} onSubmit={(link) => { setUrl(link); setChoice("url"); go(1); return null; }} />
              <div class="about-note">{t("aboutDisclaimer")}</div>
            </>
          ) : null}
        </div>

        <div class="wz-actions">
          {at > 0 ? <button class="btn" data-focus="wz-back" onClick={() => go(-1)}>{t("wzBack")}</button> : null}
          {step === "welcome" ? <button class="btn primary" data-focus="wz-start" onClick={() => go(1)}>{t("wzStart")}</button> : null}
          {step === "display" ? <button class="btn primary" data-focus="wz-next" onClick={() => go(1)}>{t("wzNext")}</button> : null}
          {step === "profile" ? (
            <>
              <button class="btn" data-focus="wz-guest" onClick={() => { setGuest(true); go(1); }}>{t("welcomeGuest")}</button>
              <button class="btn primary" data-focus="wz-next" onClick={() => { if (name.trim() !== "") { setGuest(false); go(1); } }}>{t("wzNext")}</button>
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
      <div class="wz-hints">{t("wzHints")}</div>
    </div>
  );
}
