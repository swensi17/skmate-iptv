import { useState } from "preact/hooks";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import { guidesForPlaylist } from "@skmate/epg";
import { t } from "../i18n";
import type { PlaylistEntry } from "../state/playlists";
import { normalizeUrl } from "../state/playlists";
import type { Settings } from "../state/settings";
import type { GuideStatus } from "../state/useGuide";
import { clock } from "../time";
import { onOff, SettingRow } from "./SettingRow";

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
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const autoGuides = s.epgAuto && p.active ? guidesForPlaylist(p.active.name, p.active.url, p.headerGuides) : [];

  const add = () => {
    const clean = normalizeUrl(url);
    if (!clean) { setError(t("epgBadUrl")); return; }
    setError(null);
    if (!s.epgSources.some((x) => x.url === clean)) {
      p.onChange({ ...s, epgSources: [...s.epgSources, { id: `own:${clean}`, name: clean.replace(/^https?:\/\//, "").split("/")[0] ?? clean, url: clean }] });
    }
    setUrl("");
  };
  const remove = (id: string) => p.onChange({ ...s, epgSources: s.epgSources.filter((x) => x.id !== id) });
  const outcomeOf = (u: string) => p.outcomes.find((o) => o.source.url === u);
  const line = (o: SourceOutcome | undefined) =>
    o ? (o.ok ? t("epgOk", { linked: o.linked, n: o.programmes }) : t("epgFailed", { err: o.error ?? "" })) : "";

  return (
    <>
      <SettingRow id="s-epgauto" title="setEpgAuto" hint="setEpgAutoHint" value={s.epgAuto} onPick={(v) => p.onChange({ ...s, epgAuto: v })} options={onOff()} />
      <SettingRow id="s-epgevery" title="setEpgEvery" hint="setEpgEveryHint" value={s.epgEvery} onPick={(v) => p.onChange({ ...s, epgEvery: v })}
        options={[6, 12, 24].map((n) => ({ value: n as Settings["epgEvery"], label: t("hours", { n }) }))} />

      <div class="setting-title" style={{ margin: "20px 12px 8px" }}>{t("epgSources")}</div>
      {autoGuides.map((g) => (
        <div class="srcrow" key={g.url}>
          <span class="grow"><span class="srow-title small">{g.name}</span><span class="srow-hint">{g.url.replace(/^https?:\/\//, "")}</span></span>
          <span class="srow-hint">{line(outcomeOf(g.url))}</span>
        </div>
      ))}
      {s.epgSources.map((x) => (
        <div class="playlist" key={x.id}>
          <button class="row" data-focus={`epg-${x.id}`} onClick={() => remove(x.id)}>
            <span class="grow two"><span class="nm">{x.name}</span><span class="prog">{x.url.replace(/^https?:\/\//, "")}</span></span>
            <span class="sub">{line(outcomeOf(x.url)) || t("playlistDelete")}</span>
          </button>
        </div>
      ))}
      <div class="add">
        <input class="field" data-focus="epg-url" value={url} placeholder={t("epgAddPlaceholder")}
          onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button class="btn" data-focus="epg-add" onClick={add}>{t("epgAdd")}</button>
      </div>
      {error ? <div class="status error">{error}</div> : null}

      <div class="add" style={{ marginTop: 8 }}>
        <input class="field" data-focus="epg-proxy" value={s.proxy} placeholder={t("proxyPlaceholder")}
          onInput={(e) => p.onChange({ ...s, proxy: (e.currentTarget as HTMLInputElement).value.trim() })} />
      </div>
      <div class="srow-hint" style={{ margin: "0 12px 12px" }}>{t("setProxy")}. {t("setProxyHint")}</div>

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
