import { useEffect, useMemo, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { ChannelRow } from "./ChannelRow";

export function LiveView({ channels, onOpen }: { channels: Channel[]; onOpen: (c: Channel) => void }) {
  const groups = useMemo(() => groupsOf(channels), [channels]);
  const [group, setGroup] = useState<string | null>(null);
  const shown = group === null ? channels : groups.find((g) => g.name === group)?.channels ?? [];
  useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : undefined); }, [group]);

  return (
    <div class="screen live">
      <aside class="groups">
        <h2>{t("navLive")}</h2>
        <button class="row" data-focus="g-all" onClick={() => setGroup(null)} aria-pressed={group === null}>
          <span class="grow">{t("allChannels")}</span>
          <span class="sub">{channels.length}</span>
        </button>
        {groups.map((g, i) => (
          <button class="row" key={g.name} data-focus={`g-${i}`} onClick={() => setGroup(g.name)} aria-pressed={group === g.name}>
            <span class="grow">{g.name}</span>
            <span class="sub">{g.channels.length}</span>
          </button>
        ))}
      </aside>
      <section class="list">
        <div class="list-head">{t("channelsCount", { n: shown.length })}</div>
        <div class="scroll">
          {shown.map((c, i) => <ChannelRow key={c.id} channel={c} index={i} onOpen={onOpen} />)}
        </div>
      </section>
    </div>
  );
}
