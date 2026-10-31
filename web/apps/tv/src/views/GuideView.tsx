import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, Icon, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import type { GuideStatus } from "../state/useGuide";
import { clock, floorHalfHour } from "../time";
import { ChannelLogo } from "./ChannelLogo";
import type { Programme } from "@skmate/epg";

const ROW = 84;
const LIST_HEIGHT = 672;
const NAME_W = 340;
const TIMELINE_W = 1280;
const SPAN_MS = 3 * 3_600_000;
const SHIFT_MS = 3 * 3_600_000;
const MIN_TEXT_W = 90;

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: GuideStatus;
  onRefresh: () => void;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
}

/** The guide: channels down the side, three hours of programmes across, the one in focus described below. */
export function GuideView({ channels, favorites, status, onRefresh, onOpen }: Props) {
  const { data, now } = useContext(GuideContext);
  const [from, setFrom] = useState(() => floorHalfHour(Date.now() - 30 * 60_000));
  const [sel, setSel] = useState<{ channel: Channel; programme: Programme } | null>(null);
  const rows = useMemo(() => channels.filter((c) => data.of(c.id).length > 0), [channels, data]);

  useEffect(() => { focusFirst(document, rows[0] ? `pg-${rows[0].id}-name` : "guide-refresh"); }, [rows.length === 0]);
  void favorites;

  const x = (ms: number) => ((ms - from) / SPAN_MS) * TIMELINE_W;
  const nowX = x(now);
  const marks: number[] = [];
  for (let m = from; m < from + SPAN_MS; m += 30 * 60_000) marks.push(m);

  const empty = rows.length === 0;
  return (
    <div class="screen guide">
      <div class="guide-head">
        <h2>{t("navGuide")}</h2>
        <div class="toolbar">
          <button class="btn tool" data-focus="guide-back" onClick={() => setFrom((f) => f - SHIFT_MS)}>{t("guideBack")}</button>
          <button class="btn tool" data-focus="guide-now" onClick={() => setFrom(floorHalfHour(Date.now() - 30 * 60_000))}>{t("guideNow")}</button>
          <button class="btn tool" data-focus="guide-fwd" onClick={() => setFrom((f) => f + SHIFT_MS)}>{t("guideForward")}</button>
          <button class="btn tool" data-focus="guide-refresh" onClick={onRefresh}>
            <Icon name="refresh" size={26} /> {status.kind === "syncing" ? status.text : t("guideRefresh")}
          </button>
        </div>
      </div>

      {empty ? (
        <div class="empty guide-empty">
          <div class="empty-title">{status.kind === "syncing" ? t("guideLoading") : t("guideEmptyTitle")}</div>
          <div class="empty-hint">{status.kind === "syncing" ? status.text : t("guideEmptyHint")}</div>
        </div>
      ) : (
        <>
          <div class="guide-scale" style={{ paddingLeft: `${NAME_W}px`, width: `${NAME_W + TIMELINE_W}px` }}>
            {marks.map((m) => <span class="mark" key={m} style={{ left: `${NAME_W + x(m)}px` }}>{clock(m)}</span>)}
          </div>
          <div class="guide-body" style={{ width: `${NAME_W + TIMELINE_W}px` }}>
            <VirtualList
              items={rows} rowHeight={ROW} height={LIST_HEIGHT} pageSize={8}
              idOf={(c) => `pg-${c.id}`}
              renderRow={(c, i) => (
                <div class="grow-row">
                  <button class="gname" data-focus={`pg-${c.id}-name`} style={{ width: `${NAME_W - 12}px` }} onClick={() => onOpen(c, rows)}>
                    <span class="sub" style={{ width: 44, textAlign: "right" }}>{i + 1}</span>
                    <ChannelLogo channel={c} />
                    <span class="grow nm">{c.name}</span>
                  </button>
                  <div class="gline" style={{ left: `${NAME_W}px`, width: `${TIMELINE_W}px` }}>
                    {data.of(c.id).filter((p) => p.stop > from && p.start < from + SPAN_MS).map((p) => {
                      const left = Math.max(0, x(p.start));
                      const width = Math.min(TIMELINE_W, x(p.stop)) - left - 4;
                      const live = p.start <= now && now < p.stop;
                      return (
                        <button
                          class={`block${live ? " live" : ""}`} key={p.start} data-focus={`pg-${c.id}-${p.start}`}
                          style={{ left: `${left}px`, width: `${Math.max(8, width)}px` }}
                          onFocus={() => setSel({ channel: c, programme: p })}
                          onClick={() => onOpen(c, rows)}
                        >
                          {width >= MIN_TEXT_W ? <span class="block-t">{p.title}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            />
            {nowX >= 0 && nowX <= TIMELINE_W ? <div class="nowline" style={{ left: `${NAME_W + nowX}px`, height: `${LIST_HEIGHT}px` }} /> : null}
          </div>
          <div class="guide-detail">
            {sel ? (
              <>
                <div class="gd-title">{sel.programme.title}</div>
                <div class="gd-sub">{sel.channel.name} · {clock(sel.programme.start)} – {clock(sel.programme.stop)}</div>
                <div class="gd-desc">{sel.programme.desc ?? t("guideNoDesc")}</div>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export { channelKey };
