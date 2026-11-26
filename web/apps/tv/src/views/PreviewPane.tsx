import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import { Spinner } from "./Spinner";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { GuideContext } from "../state/GuideContext";
import { capitalize } from "../text";
import { clock } from "../time";
import { leftLabel } from "./Left";
import { ChannelLogo } from "./ChannelLogo";
import { detectPlatform } from "../platform";

/**
 * On a TV the preview opens only once the cursor has rested this long on one channel (on top of the list's own
 * dwell), and closes at once when the cursor moves: a TV has one hardware decoder, and a preview still opening when
 * a channel is started full screen would keep it from the player.
 */
const TV_REST_MS = detectPlatform() === "browser" ? 0 : 800;

/** A muted live window for the channel under the cursor, so a channel can be judged before it is opened. */
export function PreviewPane({ channel, focused, settings }: { channel: Channel | null; focused: Channel | null; settings: Settings }) {
  const info = focused ?? channel;
  const { data, now } = useContext(GuideContext);
  const nn = info ? data.nowNext(info.id, now) : null;
  // The stream of the preview: only for the channel the cursor is still on, after the rest; any move releases it.
  const [rested, setRested] = useState<string | null>(null);
  useEffect(() => {
    setRested(null);
    if (!channel) return;
    if (TV_REST_MS === 0) { setRested(channel.url); return; }
    const id = setTimeout(() => setRested(channel.url), TV_REST_MS);
    return () => clearTimeout(id);
  }, [channel?.url, focused?.id]);
  const live = channel && rested === channel.url && (!focused || focused.id === channel.id) ? channel : null;
  return (
    <aside class="preview" aria-label={t("setPreview")}>
      <div class="preview-video">
        {live && settings.preview ? <PreviewVideo key={live.url} channel={live} settings={settings} /> : <div class="preview-empty"><Icon name="live_tv" size={72} /></div>}
      </div>
      {info ? (
        <>
        <div class="preview-info">
          <ChannelLogo channel={info} />
          <div>
            <div class="preview-title">{info.name}</div>
            <div class="preview-sub">{capitalize(info.group)}</div>
          </div>
        </div>
        {nn?.now ? (
          <div class="preview-prog">
            <div class="pp-title">{nn.now.title}</div>
            <div class="pp-time">{clock(nn.now.start)} – {clock(nn.now.stop)} · {leftLabel(nn.now.stop, now)}</div>
            <div class="bar big"><span class="bar-fill" style={{ width: `${Math.round(nn.progress * 100)}%` }} /></div>
            {nn.now.desc ? <div class="pp-desc">{nn.now.desc}</div> : null}
            {nn.next ? <div class="pp-next"><b>{clock(nn.next.start)}</b> {nn.next.title}</div> : null}
          </div>
        ) : null}
        </>
      ) : <div class="preview-sub">{t("previewNone")}</div>}
      <div class="preview-hint">{t("favHint")}</div>
    </aside>
  );
}

export function PreviewVideo({ channel, settings }: { channel: Channel; settings: Settings }) {
  const video = useRef<HTMLVideoElement>(null);
  const { state } = usePlayback(video, channel, {
    engine: settings.engine, bufferSeconds: 10, openTimeoutMs: settings.openTimeout * 1000, autoRestart: false,
  });
  return (
    <>
      <video ref={video} class="pv" muted autoplay playsInline style={{ objectFit: "cover" }} />
      {state === "loading" ? <Spinner class="small" /> : null}
      {state === "failed" ? <div class="preview-empty"><Icon name="warning" size={56} /></div> : null}
    </>
  );
}
