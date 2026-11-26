import { createPortal } from "preact/compat";
import { useRef, useState } from "preact/hooks";
import { focusFirst, useOwnBack } from "@skmate/ui";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import { guidesForPlaylist } from "@skmate/epg";
import { t } from "../i18n";
import type { PlaylistEntry } from "../state/playlists";
import { normalizeUrl } from "../state/playlists";
import type { Settings } from "../state/settings";
import type { GuideStatus } from "../state/useGuide";
import { clock } from "../time";
import { onOff, SettingRow } from "./SettingRow";
import { EntryRow } from "./EntryRow";
import { Confirm } from "./Confirm";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  data: GuideData;
  status: GuideStatus;
  outcomes: SourceOutcome[];
  channelCount: number;
  active: PlaylistEntry | null;
  headerGuides: string[];
  onRefresh: () => void;
  onClear: () => void;
}

const DAY = 86_400_000;

/** "today at 12:30", "yesterday at 08:05", "24.11 at 19:00": when something happened, in plain words. */
export function when(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const time = clock(ms);
  if (ms >= midnight.getTime()) return t("whenToday", { t: time });
  if (ms >= midnight.getTime() - DAY) return t("whenYesterday", { t: time });
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return t("whenDate", { d: date, t: time });
}

/** The guide in one line: when it was updated and how many channels of the playlist have a programme. */
export function guideLine(data: GuideData, channelCount: number): string {
  return data.updatedAt === 0 ? t("epgNever") : t("epgUpdated", { when: when(data.updatedAt), linked: data.linked, total: channelCount });
}

/**
 * How one source did at the last update. The per-source results live only until the app restarts: with a guide
 * already loaded and no result yet, nothing is said rather than a guess.
 */
function outcomeLine(o: SourceOutcome | undefined, loaded: boolean): string {
  if (!o) return loaded ? "" : t("epgSrcWaiting");
  if (!o.ok) return t("epgSrcFailed", { err: o.error ?? "" });
  return o.linked > 0 ? t("epgSrcOk", { linked: o.linked }) : t("epgSrcNone");
}

const bare = (url: string) => url.replace(/^https?:\/\//, "");

/** "Delete this source?" over the settings, as for a playlist; Back answers "Cancel" and leaves the section open. */
function AskDelete(p: { name: string; onYes: () => void; onNo: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onNo);
  return createPortal(
    <div ref={root}>
      <Confirm title={t("epgDeleteTitle")} body={p.name} confirm={t("playlistDelete")} onConfirm={p.onYes} onCancel={p.onNo} />
    </div>,
    document.getElementById("app") ?? document.body, // inside the scaled stage, above the settings sheet
  );
}

/**
 * The guide, in the order a viewer needs it: what it is and how it is now (with "Update now"), where it comes from
 * (the sources the playlist names, then the viewer's own, each with how it did), the reminders, and last what only
 * matters when something does not work (how often, the proxy, clearing).
 */
export function EpgPanel(p: Props) {
  const { settings: s } = p;
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const doomed = s.epgSources.find((x) => x.id === asking);
  const autoGuides = p.active ? guidesForPlaylist(p.active.name, p.active.url, p.headerGuides) : [];
  const syncing = p.status.kind === "syncing";

  const add = (url: string) => {
    if (url.trim() === "") return;
    const clean = normalizeUrl(url);
    if (!clean) { setError(t("epgBadUrl")); return; }
    setError(null);
    if (!s.epgSources.some((x) => x.url === clean)) {
      p.onChange({ ...s, epgSources: [...s.epgSources, { id: `own:${clean}`, name: bare(clean).split("/")[0] ?? clean, url: clean }] });
    }
  };
  // The focus stays in the list: on the next source's "Delete", or on "Add a source" when none is left.
  const remove = (id: string) => {
    const rest = s.epgSources.filter((x) => x.id !== id);
    p.onChange({ ...s, epgSources: rest });
    setTimeout(() => focusFirst(document, rest[0] ? `epg-del-${rest[0].id}` : "epg-url"), 0);
  };
  const outcomeOf = (u: string) => outcomeLine(p.outcomes.find((o) => o.source.url === u), p.data.updatedAt > 0);

  return (
    <div class="setting epg-panel">
      <div class="set-intro">{t("epgIntro")}</div>
      <button class="srow" data-focus="epg-refresh" onClick={p.onRefresh} aria-busy={syncing}>
        <span class="srow-text">
          <span class="srow-title">{syncing ? t("epgRefreshing") : t("epgRefreshNow")}</span>
          <span class="srow-hint">{p.status.kind === "syncing" ? p.status.text : guideLine(p.data, p.channelCount)}</span>
        </span>
      </button>

      <div class="caption">{t("epgAutoCaption")}</div>
      <SettingRow id="s-epgauto" title="setEpgAuto" hint="setEpgAutoHint" value={s.epgAuto} onPick={(v) => p.onChange({ ...s, epgAuto: v })} options={onOff()} />
      {s.epgAuto ? autoGuides.map((g) => (
        // Read only: there is nothing to change about a source the playlist names, the row only says how it did.
        <div class="irow src-info" key={g.url} tabIndex={0} data-focus={`epg-auto-${g.url}`}>
          <span class="srow-text">
            <span class="irow-title">{g.name}</span>
            <span class="srow-hint">{bare(g.url)}</span>
          </span>
          <span class="irow-value">{outcomeOf(g.url)}</span>
        </div>
      )) : <div class="set-note">{t("epgAutoOff")}</div>}

      <div class="caption">{t("epgSources")}</div>
      <div class="set-note">{t("epgOwnHint")}</div>
      <div class="pl-list">
        {s.epgSources.map((x) => (
          <div class="pl-item" key={x.id}>
            <div class="srow pl-row" tabIndex={0} data-focus={`epg-${x.id}`}>
              <span class="srow-text">
                <span class="srow-title">{x.name}</span>
                <span class="srow-hint">{bare(x.url)}</span>
                {outcomeOf(x.url) ? <span class="srow-hint">{outcomeOf(x.url)}</span> : null}
              </span>
            </div>
            <button class="btn pl-act" data-focus={`epg-del-${x.id}`} onClick={() => setAsking(x.id)}>{t("playlistDelete")}</button>
          </div>
        ))}
      </div>
      <EntryRow id="epg-url" title={t("epgOwnAdd")} value="" placeholder={t("epgAddPlaceholder")} entryTitle={t("epgLinkTitle")}
        entryHint={t("epgLinkHint")} fresh onDone={add} />
      {error ? <div class="status error set-error">{error}</div> : null}

      <div class="caption">{t("capReminders")}</div>
      <SettingRow id="s-remmode" title="setReminders" hint="setRemindersHint" value={s.reminderMode} onPick={(v) => p.onChange({ ...s, reminderMode: v })}
        options={[{ value: "ask" as const, label: t("setReminderAsk") }, { value: "switch" as const, label: t("setReminderSwitch") }, { value: "notify" as const, label: t("setReminderNotify") }]} />
      <SettingRow id="s-remlead" title="setReminderLead" hint="setReminderLeadHint" value={s.reminderLead} onPick={(v) => p.onChange({ ...s, reminderLead: v })}
        options={[{ value: 0 as const, label: t("setReminderAtStart") }, { value: 1 as const, label: t("minBefore", { n: 1 }) }, { value: 5 as const, label: t("minBefore", { n: 5 }) }]} />

      <div class="caption">{t("capAdvanced")}</div>
      <SettingRow id="s-epgevery" title="setEpgEvery" hint="setEpgEveryHint" value={s.epgEvery} onPick={(v) => p.onChange({ ...s, epgEvery: v })}
        options={[6, 12, 24].map((n) => ({ value: n as Settings["epgEvery"], label: t("hours", { n }) }))} />
      <EntryRow id="epg-proxy" title={t("setProxy")} value={s.proxy} placeholder={t("proxyEmpty")} entryHint={t("proxyEntryHint")}
        onDone={(v) => p.onChange({ ...s, proxy: v.trim() })} />
      {doomed ? <AskDelete name={doomed.url} onYes={() => { setAsking(null); remove(doomed.id); }} onNo={() => setAsking(null)} /> : null}
      <button class="srow" data-focus="epg-clear" onClick={p.onClear}>
        <span class="srow-text"><span class="srow-title">{t("epgClear")}</span><span class="srow-hint">{t("epgClearHint")}</span></span>
      </button>
    </div>
  );
}
