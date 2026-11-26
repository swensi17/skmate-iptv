import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, Popup, Presence, Toggle, useOwnBack } from "@skmate/ui";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import { guidesForPlaylist } from "@skmate/epg";
import { t } from "../i18n";
import type { PlaylistEntry } from "../state/playlists";
import { normalizeUrl } from "../state/playlists";
import type { Settings } from "../state/settings";
import type { GuideStatus } from "../state/useGuide";
import { clock } from "../time";
import { Confirm } from "./Confirm";
import { SHeading, SIcon, SNote, SRow, useSheet, OverSheet } from "./SettingsKit";
import { TextEntry } from "./TextEntry";

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

/** The public guides Android offers as one switch each (EpgCatalog.kt). */
export const EPG_CATALOG: Array<{ name: string; url: string }> = [
  { name: "TV Team", url: "http://epg.team/tvteam.xml.gz" },
  { name: "it999 RU (epg.one)", url: "http://epg.it999.ru/ru2.xml.gz" },
  { name: "it999 Edem", url: "http://epg.it999.ru/edem.xml.gz" },
  { name: "epg.one", url: "http://epg.one/epg.xml.gz" },
];

/** How many guides feed the channels now: those the playlist names (when automatic) and the viewer's own. */
export function epgSourceCount(s: Settings, active: PlaylistEntry | null, headerGuides: string[]): number {
  const auto = s.epgAuto && active ? guidesForPlaylist(active.name, active.url, headerGuides) : [];
  return auto.length + s.epgSources.length;
}

const bare = (url: string) => url.replace(/^https?:\/\//, "");

/** `RowActionsPopup`: the guide's name and its actions. */
function Actions(p: { title: string; actions: Array<{ icon: string; text: string; danger?: boolean; run: () => void }>; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { setTimeout(() => focusFirst(document, "eact-0"), 0); }, []);
  return (
    <OverSheet app>
      <div ref={root}>
        <Popup title={p.title} width={600} onClose={p.onClose} returnFocus>
          {p.actions.map((a, i) => (
            <button key={a.text} class={`st-focusable st-option${a.danger ? " danger" : ""}`} data-focus={`eact-${i}`} onClick={() => { p.onClose(); a.run(); }}>
              <span class={`st-option-lead${a.danger ? " set-danger" : ""}`}><SIcon name={a.icon} size={28} /></span>
              <span class="st-option-body"><span class="st-option-title">{a.text}</span></span>
            </button>
          ))}
        </Popup>
      </div>
    </OverSheet>
  );
}

/**
 * Источники EPG (EpgSourcesScreen.kt in the sheet): one row per guide — the ones the playlist names, then the viewer's
 * own — with how it did under the name (OK: Обновить / Изменить / Удалить), the catalogue of public guides as one switch
 * each, and "Добавить EPG".
 */
export function EpgPanel(p: Props) {
  const { settings: s } = p;
  const sheet = useSheet();
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; name: string; url: string; own: boolean } | null>(null);
  const [typing, setTyping] = useState<{ id: string | null; url: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const autoGuides = s.epgAuto && p.active ? guidesForPlaylist(p.active.name, p.active.url, p.headerGuides) : [];
  const syncing = p.status.kind === "syncing";
  const doomed = s.epgSources.find((x) => x.id === asking);

  const lineOf = (url: string): { text: string; error?: boolean } => {
    if (syncing) return { text: t("sa_settings_epg_sources_syncing_label") };
    const o = p.outcomes.find((x) => x.source.url === url);
    if (!o) return { text: p.data.updatedAt > 0 ? guideLine(p.data, p.channelCount) : t("sa_settings_epg_sources_not_synced") };
    if (!o.ok) return { text: bare(url), error: true };
    return { text: o.linked > 0 ? t("epgSrcOk", { linked: o.linked }) : t("epgSrcNone") };
  };
  const errorOf = (url: string) => p.outcomes.find((x) => x.source.url === url && !x.ok)?.error ?? null;

  const save = (id: string | null, url: string) => {
    const clean = normalizeUrl(url);
    if (!clean) { setError(t("epgBadUrl")); return; }
    setError(null);
    const rest = s.epgSources.filter((x) => x.id !== id && x.url !== clean);
    p.onChange({ ...s, epgSources: [...rest, { id: `own:${clean}`, name: bare(clean).split("/")[0] ?? clean, url: clean }] });
    setTimeout(() => sheet.focus(`epg-own:${clean}`), 0);
  };
  const remove = (id: string) => {
    const rest = s.epgSources.filter((x) => x.id !== id);
    p.onChange({ ...s, epgSources: rest });
    setTimeout(() => sheet.focus(rest[0] ? `epg-${rest[0].id}` : "epg-add"), 0);
  };
  const toggleCatalog = (url: string, name: string) => {
    const on = s.epgSources.some((x) => x.url === url);
    p.onChange({ ...s, epgSources: on ? s.epgSources.filter((x) => x.url !== url) : [...s.epgSources, { id: `own:${url}`, name, url }] });
  };
  const row = (id: string, name: string, url: string, own: boolean) => {
    const st = lineOf(url);
    const err = errorOf(url);
    return (
      <SRow key={id} id={`epg-${id}`} icon="EPG" title={name} line={st.text}
        end={err ? <span class="set-err-end">{err}</span> : undefined}
        onOk={() => setActing({ id, name, url, own })} />
    );
  };

  return (
    <div class="epg-panel">
      {autoGuides.length + s.epgSources.length === 0 ? <SNote title={t("sa_settings_epg_sources_empty")} /> : null}
      {autoGuides.map((g) => row(`auto:${g.url}`, g.name, g.url, false))}
      {s.epgSources.map((x) => row(x.id, x.name, x.url, true))}
      <SHeading text={t("sa_settings_epg_catalog")} />
      <SNote title="" body={t("sa_settings_epg_catalog_description")} />
      {EPG_CATALOG.map((g) => (
        <SRow key={g.url} id={`epgc-${g.url}`} icon="EPG" title={g.name} end={<Toggle on={s.epgSources.some((x) => x.url === g.url)} />}
          onOk={() => toggleCatalog(g.url, g.name)} />
      ))}
      <SRow id="epg-add" icon="ADD" title={t("sa_content_epg_add")} line={error ?? undefined} className={error ? "pl-bad" : undefined} onOk={() => setTyping({ id: null, url: "" })} />
      {acting ? (
        <Actions title={acting.name} onClose={() => setActing(null)} actions={[
          { icon: "REFRESH", text: t("sa_settings_sources_resync"), run: p.onRefresh },
          ...(acting.own ? [
            { icon: "PENCIL", text: t("sa_common_edit"), run: () => setTyping({ id: acting.id, url: acting.url }) },
            { icon: "TRASH", text: t("sa_common_delete"), danger: true, run: () => setAsking(acting.id) },
          ] : []),
        ]} />
      ) : null}
      <Presence show={typing !== null}>
        {(out) => (
          <TextEntry title={t("sa_content_epg_add")} hint={t("epgLinkHint")} value={typing?.url ?? ""} closing={out}
            onCancel={() => { const back = typing?.id ? `epg-${typing.id}` : "epg-add"; setTyping(null); setTimeout(() => sheet.focus(back), 0); }}
            onDone={(v) => { const id = typing?.id ?? null; setTyping(null); if (v.trim()) save(id, v); else setTimeout(() => sheet.focus("epg-add"), 0); }} />
        )}
      </Presence>
      {doomed ? <Confirm title={t("epgDeleteTitle")} body={doomed.url} confirm={t("sa_common_delete")} onConfirm={() => { setAsking(null); remove(doomed.id); }} onCancel={() => setAsking(null)} /> : null}
    </div>
  );
}
