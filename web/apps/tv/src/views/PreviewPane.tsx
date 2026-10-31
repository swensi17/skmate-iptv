import { useContext, useRef } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { GuideContext } from "../state/GuideContext";
import { capitalize } from "../text";
import { clock } from "../time";
import { leftLabel } from "./Left";
import { ChannelLogo } from "./ChannelLogo";

/** A muted live window for the channel under the cursor, so a channel can be judged before it is opened. */
export function PreviewPane({ channel, focused, settings }: { channel: Channel | null; focused: Channel | null; settings: Settings }) {
  const info = focused ?? channel;
  const { data, now } = useContext(GuideContext);
  const nn = info ? data.nowNext(info.id, now) : null;
  return (
    <aside class="preview" aria-label={t("setPreview")}>
      <div class="preview-video">
        {channel && settings.preview ? <PreviewVideo key={channel.url} channel={channel} settings={settings} /> : <div class="preview-empty"><Icon name="live_tv" size={72} /></div>}
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

function PreviewVideo({ channel, settings }: { channel: Channel; settings: Settings }) {
  const video = useRef<HTMLVideoElement>(null);
  const { state } = usePlayback(video, channel, {
    engine: settings.engine, bufferSeconds: 10, openTimeoutMs: settings.openTimeout * 1000, autoRestart: false,
  });
  return (
    <>
      <video ref={video} class="pv" muted autoplay playsInline style={{ objectFit: "cover" }} />
      {state === "loading" ? <div class="spinner small" /> : null}
      {state === "failed" ? <div class="preview-empty"><Icon name="warning" size={56} /></div> : null}
    </>
  );
}
