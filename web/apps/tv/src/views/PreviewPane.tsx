import { useRef } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { capitalize } from "../text";
import { ChannelLogo } from "./ChannelLogo";

/** A muted live window for the channel under the cursor, so a channel can be judged before it is opened. */
export function PreviewPane({ channel, focused, settings }: { channel: Channel | null; focused: Channel | null; settings: Settings }) {
  const info = focused ?? channel;
  return (
    <aside class="preview" aria-label={t("setPreview")}>
      <div class="preview-video">
        {channel && settings.preview ? <PreviewVideo key={channel.url} channel={channel} settings={settings} /> : <div class="preview-empty"><Icon name="live_tv" size={72} /></div>}
      </div>
      {info ? (
        <div class="preview-info">
          <ChannelLogo channel={info} />
          <div>
            <div class="preview-title">{info.name}</div>
            <div class="preview-sub">{capitalize(info.group)}</div>
          </div>
        </div>
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
