import { Spinner } from "./Spinner";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  addTile, BACKGROUND_TILE_HEIGHT, canAddTile, clear, connectionBudget, fill, focus as focusTile, giveSound, groupsOf, LONG_PRESS_MS, rowsOf,
  silenceFailed, type Channel, type Grid, type Refusal,
} from "@skmate/core";
import { focusFirst, Icon, isBack, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import type { Settings } from "../state/settings";
import { UiContext } from "../state/UiContext";
import { usePlayback } from "../state/usePlayback";
import { ChannelRow } from "./ChannelRow";

const tileId = (i: number) => `mv-${i}`;

interface TileProps {
  index: number;
  channel: Channel | null;
  audible: boolean;
  focused: boolean;
  soundOnly: boolean;
  refusal: string | null;
  settings: Settings;
  /** Reports a tile that cannot play, so the sound moves off it. */
  onFailed: (index: number, failed: boolean) => void;
  onOk: (index: number) => void;
  onMenu: (index: number) => void;
}

/** The picture of a filled tile: muted unless it has the sound, no taller than 720 lines when it has not (Android's BACKGROUND_TILE_HEIGHT). */
function Picture(p: { channel: Channel; audible: boolean; hidden: boolean; settings: Settings; onState: (state: "loading" | "playing" | "failed", retry: () => void) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const { state, retry } = usePlayback(video, p.channel, {
    engine: p.settings.engine, bufferSeconds: Math.min(p.settings.buffer, 30), openTimeoutMs: p.settings.openTimeout * 1000, autoRestart: p.settings.autoRestart,
    ...(p.audible ? {} : { maxHeight: BACKGROUND_TILE_HEIGHT }),
  });
  useEffect(() => { p.onState(state, retry); }, [state]);
  useEffect(() => { if (video.current) video.current.muted = !p.audible; }, [p.audible, state]);
  return <video ref={video} class="mv-video" style={{ visibility: p.hidden ? "hidden" : "visible" }} autoplay playsInline muted />;
}

/** One tile: the channel's picture, the name, the sound mark, and why it did not open. */
function Tile(p: TileProps) {
  const down = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const retry = useRef<() => void>(() => undefined);
  const [state, setState] = useState<"loading" | "playing" | "failed">("loading");
  const live = p.channel !== null && p.refusal === null;
  const failed = live && state === "failed";
  useEffect(() => { p.onFailed(p.index, failed); }, [failed]);
  useEffect(() => { if (!live) setState("loading"); }, [live]);

  // OK held for half a second opens the tile's menu, a short OK acts on it (picks a channel, or gives it the sound).
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ContextMenu" || e.keyCode === 82 || e.keyCode === 457) { e.preventDefault(); p.onMenu(p.index); return; }
    if (e.key !== "Enter" && e.keyCode !== 13) return;
    e.preventDefault();
    if (e.repeat) return;
    down.current = Date.now();
    timer.current = setTimeout(() => { if (down.current !== null) { down.current = null; p.onMenu(p.index); } }, LONG_PRESS_MS);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.keyCode !== 13) return;
    clearTimeout(timer.current);
    if (down.current !== null) { down.current = null; p.onOk(p.index); }
  };
  const message = p.refusal ?? (failed ? t("mvErrorChannel") : p.soundOnly && live ? t("mvSoundOnlyNote") : null);
  return (
    <button
      class={`mv-tile${p.focused ? " on" : ""}`} data-focus={tileId(p.index)} aria-label={p.channel?.name ?? t("mvAddChannel")}
      onKeyDown={onKeyDown as unknown as (e: Event) => void} onKeyUp={onKeyUp as unknown as (e: Event) => void}
      onClick={(e) => { if ((e as MouseEvent).detail > 0) p.onOk(p.index); }}
      onContextMenu={(e) => { e.preventDefault(); p.onMenu(p.index); }}
    >
      {live && p.channel ? (
        <Picture key={p.channel.url} channel={p.channel} audible={p.audible} hidden={p.soundOnly} settings={p.settings}
          onState={(st, r) => { setState(st); retry.current = r; }} />
      ) : null}
      {p.channel === null ? <span class="mv-empty"><Icon name="chevron" size={40} />{t("mvAddChannel")}</span> : null}
      {message ? <span class="mv-note" onClick={failed ? () => retry.current() : undefined}>{message}</span> : null}
      {p.channel ? (
        <span class="mv-caption">
          <span class="mv-name">{p.channel.name}</span>
          {p.audible ? <span aria-label={t("mvAudioTile")}><Icon name="volume_high" size={22} /></span> : null}
        </span>
      ) : null}
      {state === "loading" && live ? <Spinner class="mv-spin on" /> : null}
    </button>
  );
}

/** What a refusal says (Android's budget sentences). */
const refusalText = (r: Refusal): string => (r.kind === "single" ? t("mvRefusedSingle") : t("mvRefusedAll", { n: r.max }));

/** A category, then a channel of it, for the tile that is being filled. */
function Picker(p: { channels: readonly Channel[]; favorites: ReadonlySet<string>; onPick: (c: Channel) => void; onClose: () => void }) {
  const ROW = useContext(UiContext).rowH;
  const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
  const [group, setGroup] = useState<string | null>(null);
  const list = useMemo(() => (group === null ? [] : groups.find((g) => g.name === group)?.channels ?? []), [group, groups]);
  useEffect(() => { focusFirst(document, group === null ? "mv-pick-first" : undefined); }, [group]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e)) return;
      e.stopPropagation(); e.preventDefault();
      if (group !== null) setGroup(null); else p.onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [group]);
  return (
    <div class="scrim" data-modal>
      <div class="dialog mv-picker" role="dialog" aria-label={t("mvAddChannel")}>
        {group === null ? (
          <div class="mv-groups">
            {groups.map((g, i) => (
              <button class="row" key={g.name} data-focus={i === 0 ? "mv-pick-first" : `mv-g-${i}`} onClick={() => setGroup(g.name)}>
                <span class="grow">{g.name || "—"}</span><span class="sub">{g.channels.length}</span>
              </button>
            ))}
          </div>
        ) : (
          <VirtualList
            key={group} items={list} rowHeight={ROW} height={760} pageSize={8} autofocus
            idOf={(c) => `ch-${c.id}`}
            renderRow={(c, i) => <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))} onOpen={p.onPick} onFav={() => undefined} />}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Several live channels on one screen, as the Android app's multiview: tiles in rows of two, the D-pad moves between
 * them, OK on a tile gives it the sound (or picks a channel for an empty one), OK held or the menu key opens the tile's
 * menu. Back leaves and stops everything. [maxConnections] is the provider's limit (0 = unknown).
 */
export function MultiviewScreen(p: {
  initial: Grid;
  catalog: readonly Channel[];
  favorites: ReadonlySet<string>;
  settings: Settings;
  maxTiles: number;
  maxConnections: number;
  onFullscreen: (c: Channel) => void;
  onExit: () => void;
}) {
  const [grid, setGrid] = useState<Grid>(p.initial);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const failedNow = useRef<ReadonlySet<number>>(failed);
  failedNow.current = failed;
  const [soundOnly, setSoundOnly] = useState<ReadonlySet<number>>(new Set());
  const [refused, setRefused] = useState<ReadonlyMap<number, string>>(new Map());
  const [menu, setMenu] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);

  const setIn = <T,>(set: ReadonlySet<T>, v: T, on: boolean): ReadonlySet<T> => { const n = new Set(set); if (on) n.add(v); else n.delete(v); return n; };
  const onFailed = (i: number, bad: boolean) => {
    const next = setIn(failedNow.current, i, bad);
    failedNow.current = next;
    setFailed(next);
    // A tile that cannot play loses the sound to the first one that does.
    if (bad) setGrid((g) => silenceFailed(g, next));
  };
  /** A channel on a tile, if the provider has a connection for it; the tile says why when it has not. */
  const fillTile = (tile: number, c: Channel) => {
    const open = grid.tiles.filter((x, i) => x !== null && i !== tile && !refused.has(i)).length; // a swap is not two
    const refusal = connectionBudget(p.maxConnections, open);
    setRefused((cur) => { const n = new Map(cur); if (refusal) n.set(tile, refusalText(refusal)); else n.delete(tile); return n; });
    setFailed((cur) => setIn(cur, tile, false));
    setSoundOnly((cur) => setIn(cur, tile, false));
    setGrid((g) => fill(g, tile, c));
  };
  const onOk = (i: number) => {
    setGrid((g) => focusTile(g, i));
    if (grid.tiles[i] === null) setPicking(i);
    else setGrid((g) => giveSound(g, i, failed));
  };
  const remove = (i: number) => {
    setRefused((cur) => { const n = new Map(cur); n.delete(i); return n; });
    setGrid((g) => clear(g, i, p.maxTiles));
  };

  useEffect(() => { focusFirst(document, tileId(grid.focused)); }, []);
  useEffect(() => { if (menu !== null) focusFirst(document, "mv-menu-first"); }, [menu]);
  // Back closes what is open, then leaves: the grid is thrown away and nothing keeps playing (Android's releaseAll).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e) || picking !== null) return;
      e.stopPropagation(); e.preventDefault();
      if (menu !== null) { const m = menu; setMenu(null); setTimeout(() => focusFirst(document, tileId(m)), 30); } else p.onExit();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menu, picking]);

  const channel = menu !== null ? grid.tiles[menu] ?? null : null;
  const items: Array<[string, () => void]> = [];
  if (menu !== null) {
    items.push([t("mvTileChange"), () => { setPicking(menu); setMenu(null); }]);
    if (canAddTile(grid, p.maxTiles)) items.push([t("mvAddChannel"), () => { const g = addTile(grid, p.maxTiles); setGrid(g); setPicking(g.tiles.length - 1); setMenu(null); }]);
    if (channel) {
      const m = menu;
      items.push([t("mvTileFullscreen"), () => p.onFullscreen(channel)]);
      items.push([t("mvAudioTile"), () => { setGrid((g) => giveSound(g, m, failed)); setMenu(null); }]);
      items.push([soundOnly.has(m) ? t("mvShowPicture") : t("mvSoundOnly"), () => {
        setSoundOnly((cur) => setIn(cur, m, !cur.has(m)));
        setGrid((g) => giveSound(g, m, failed));
        setMenu(null);
      }]);
      items.push([t("mvTileRemove"), () => { remove(m); setMenu(null); }]);
    }
    items.push([t("mvClose"), () => setMenu(null)]);
  }

  return (
    <div class="multiview">
      {rowsOf(grid.tiles.length).map((row) => (
        <div class="mv-row" key={row[0]}>
          {row.map((i) => (
            <Tile
              key={i} index={i} channel={grid.tiles[i] ?? null} audible={grid.audible === i} focused={grid.focused === i}
              soundOnly={soundOnly.has(i)} refusal={refused.get(i) ?? null} settings={p.settings}
              onFailed={onFailed} onOk={onOk} onMenu={(n) => { setGrid((g) => focusTile(g, n)); setMenu(n); }}
            />
          ))}
          {row.length === 1 ? <div class="mv-blank" /> : null}
        </div>
      ))}
      {menu !== null ? (
        <div class="scrim" data-modal onClick={() => setMenu(null)}>
          <div class="dialog mv-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            {items.map(([label, run], i) => (
              <button class="row" key={label} role="menuitem" data-focus={i === 0 ? "mv-menu-first" : `mv-menu-${i}`} onClick={run}>{label}</button>
            ))}
          </div>
        </div>
      ) : null}
      {picking !== null ? (
        <Picker channels={p.catalog} favorites={p.favorites} onClose={() => { const i = picking; setPicking(null); setTimeout(() => focusFirst(document, tileId(i)), 30); }}
          onPick={(c) => { const i = picking; setPicking(null); fillTile(i, c); setTimeout(() => focusFirst(document, tileId(i)), 60); }} />
      ) : null}
    </div>
  );
}
