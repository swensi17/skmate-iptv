import { useState } from "preact/hooks";
import { focusFirst, Icon } from "@skmate/ui";
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

/** Settings of the guide: the automatic sources, the user's own, how often, what is loaded now. */
export function EpgPanel(p: Props) {
  const { settings: s } = p;
  const [error, setError] = useState<string | null>(null);
  const autoGuides = s.epgAuto && p.active ? guidesForPlaylist(p.active.name, p.active.url, p.headerGuides) : [];

  const add = (url: string) => {
    if (url.trim() === "") return;
    const clean = normalizeUrl(url);
    if (!clean) { setError(t("epgBadUrl")); return; }
    setError(null);
    if (!s.epgSources.some((x) => x.url === clean)) {
      p.onChange({ ...s, epgSources: [...s.epgSources, { id: `own:${clean}`, name: clean.replace(/^https?:\/\//, "").split("/")[0] ?? clean, url: clean }] });
    }
  };
  // The focus stays in the list: on the next source's row, or on the "add" row when none is left.
  const remove = (id: string) => {
    const rest = s.epgSources.filter((x) => x.id !== id);
    p.onChange({ ...s, epgSources: rest });
    setTimeout(() => focusFirst(document, rest[0] ? `epg-${rest[0].id}` : "epg-url"), 0);
  };
  const outcomeOf = (u: string) => p.outcomes.find((o) => o.source.url === u);
  const line = (o: SourceOutcome | undefined) =>
    o ? (o.ok ? t("epgOk", { linked: o.linked, n: o.programmes }) : t("epgFailed", { err: o.error ?? "" })) : "";

  return (
    <>
      <SettingRow id="s-epgauto" title="setEpgAuto" hint="setEpgAutoHint" value={s.epgAuto} onPick={(v) => p.onChange({ ...s, epgAuto: v })} options={onOff()} />
      <SettingRow id="s-epgevery" title="setEpgEvery" hint="setEpgEveryHint" value={s.epgEvery} onPick={(v) => p.onChange({ ...s, epgEvery: v })}
        options={[6, 12, 24].map((n) => ({ value: n as Settings["epgEvery"], label: t("hours", { n }) }))} />

      <SettingRow id="s-remmode" title="setReminders" hint="setRemindersHint" value={s.reminderMode} onPick={(v) => p.onChange({ ...s, reminderMode: v })}
        options={[{ value: "ask" as const, label: t("setReminderAsk") }, { value: "switch" as const, label: t("setReminderSwitch") }, { value: "notify" as const, label: t("setReminderNotify") }]} />
      <SettingRow id="s-remlead" title="setReminderLead" hint="setReminderLeadHint" value={s.reminderLead} onPick={(v) => p.onChange({ ...s, reminderLead: v })}
        options={[{ value: 0 as const, label: t("setReminderAtStart") }, { value: 1 as const, label: t("minBefore", { n: 1 }) }, { value: 5 as const, label: t("minBefore", { n: 5 }) }]} />

      <div class="setting-title" style={{ margin: "20px 12px 8px" }}>{t("epgSources")}</div>
      {autoGuides.map((g) => (
        <div class="srcrow" key={g.url}>
          <span class="grow"><span class="srow-title small">{g.name}</span><span class="srow-hint">{g.url.replace(/^https?:\/\//, "")}</span></span>
          <span class="srow-hint">{line(outcomeOf(g.url))}</span>
        </div>
      ))}
      {/* A source of one's own: what it is and how it loaded; deleting it is the bin beside it, never OK on the row. */}
      <div class="pl-list">
        {s.epgSources.map((x) => (
          <div class="pl-item" key={x.id}>
            <div class="srow pl-row" tabIndex={0} data-focus={`epg-${x.id}`}>
              <span class="srow-text">
                <span class="srow-title">{x.name}</span>
                <span class="srow-hint">{line(outcomeOf(x.url)) || x.url.replace(/^https?:\/\//, "")}</span>
              </span>
            </div>
            <button class="icon-btn" data-focus={`epg-del-${x.id}`} aria-label={t("playlistDelete")} title={t("playlistDelete")} onClick={() => remove(x.id)}>
              <Icon name="trash" size={30} />
            </button>
          </div>
        ))}
      </div>
      <EntryRow id="epg-url" title={t("epgAdd")} value="" placeholder={t("epgAddPlaceholder")} entryTitle={t("epgSources")}
        entryHint={t("epgAddPlaceholder")} fresh onDone={add} />
      {error ? <div class="status error">{error}</div> : null}
      <EntryRow id="epg-proxy" title={t("setProxy")} value={s.proxy} placeholder={t("setProxyHint")} entryHint={`${t("setProxyHint")}. ${t("proxyPlaceholder")}`}
        onDone={(v) => p.onChange({ ...s, proxy: v.trim() })} />

      <button class="srow" data-focus="epg-refresh" onClick={p.onRefresh}>
        <span class="srow-text">
          <span class="srow-title">{p.status.kind === "syncing" ? t("epgRefreshing") : t("epgRefreshNow")}</span>
          <span class="srow-hint">
            {p.status.kind === "syncing" ? p.status.text
              : p.data.updatedAt === 0 ? t("epgNever")
              : t("epgStatus", { when: clock(p.data.updatedAt), linked: p.data.linked, total: p.channelCount, n: p.data.programmeCount })}
          </span>
        </span>
      </button>
      <button class="srow" data-focus="epg-clear" onClick={p.onClear}>
        <span class="srow-text"><span class="srow-title">{t("epgClear")}</span><span class="srow-hint">{t("epgClearHint")}</span></span>
      </button>
    </>
  );
}
