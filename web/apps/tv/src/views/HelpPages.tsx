import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Button, focusFirst, useOwnBack } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { highlight, parseAnswer, plainFirstLine, type AnswerLine, type HelpAnswer } from "./helpAnswer";
import { OverSheet, SRow, useSheet } from "./SettingsKit";

/*
 * Как пользоваться (Android 2.5.4, features/more/HelpPage.kt): the questions as settings rows under their topics, in the
 * alphabet of the app's language inside each topic. OK opens a window over the page with the answer laid out: a sketch
 * of where to go (the path through the screens with the item to press lit, or the remote with its keys lit, or the
 * stream line) beside the numbered steps, keys and «menu items» picked out. OK, Back or a click beside it close it and
 * the focus returns to the question.
 */

interface Item { icon: string; n: number }
interface Topic { label: Key; items: Item[] }

const TOPICS: Topic[] = [
  { label: "sa_help_section_start", items: [{ icon: "PLAYLIST", n: 1 }, { icon: "REFRESH", n: 10 }, { icon: "SEND", n: 11 }, { icon: "POWER", n: 12 }, { icon: "PHONE", n: 37 }] },
  {
    label: "sa_help_section_watch",
    items: [
      { icon: "LIVE_TV", n: 2 }, { icon: "FAVORITE", n: 3 }, { icon: "IMAGE", n: 13 }, { icon: "VIDEO", n: 16 }, { icon: "MOTION", n: 15 },
      { icon: "PERSON", n: 17 }, { icon: "LIST_GRID", n: 18 }, { icon: "HISTORY", n: 19 }, { icon: "AUDIO", n: 20 }, { icon: "ASPECT", n: 21 },
      { icon: "PIP", n: 22 }, { icon: "SEARCH", n: 23 }, { icon: "STAR", n: 25 },
    ],
  },
  { label: "sa_help_section_channels", items: [{ icon: "TEXT_SIZE", n: 26 }, { icon: "SORT", n: 27 }, { icon: "CLOSE", n: 28 }, { icon: "MENU", n: 29 }, { icon: "SHARE", n: 30 }] },
  { label: "sa_help_section_archive", items: [{ icon: "REWIND", n: 4 }, { icon: "REC", n: 5 }, { icon: "PAUSE", n: 24 }] },
  { label: "sa_help_section_guide", items: [{ icon: "EPG", n: 6 }] },
  {
    label: "sa_help_section_settings",
    items: [{ icon: "LANGUAGE", n: 31 }, { icon: "PALETTE", n: 32 }, { icon: "PERSON", n: 33 }, { icon: "HOME", n: 34 }, { icon: "SPARKLE", n: 35 }, { icon: "SEND", n: 36 }],
  },
  { label: "sa_help_section_trouble", items: [{ icon: "DOWNLOADS", n: 7 }, { icon: "PLAY", n: 8 }, { icon: "WARNING", n: 9 }, { icon: "BACKUP", n: 14 }] },
];

const q = (n: number) => t(`sa_help_q${n}` as Key);
const a = (n: number) => t(`sa_help_a${n}` as Key);
const lang = () => (typeof document !== "undefined" && document.documentElement.lang) || "en";

/** The page: a topic's label (StageGroupLabel, sheet), then its questions as rows; the first question takes the focus. */
export function HelpPage() {
  const sheet = useSheet();
  const [open, setOpen] = useState<{ topic: Topic; item: Item } | null>(null);
  const topics = useMemo(() => TOPICS.map((tp) => ({
    tp, items: tp.items.map((it) => ({ it, title: q(it.n) })).sort((x, y) => x.title.localeCompare(y.title, lang())),
  })), [lang()]);
  return (
    <div class="hlp-page">
      {topics.map(({ tp, items }) => [
        <div key={tp.label} class="hlp-topic">{t(tp.label)}</div>,
        ...items.map(({ it, title }) => (
          <SRow key={it.n} id={`help-${it.n}`} icon={it.icon} title={title} line={plainFirstLine(a(it.n))} onOk={() => setOpen({ topic: tp, item: it })} />
        )),
      ])}
      {open ? (
        <HelpCard icon={open.item.icon} topic={t(open.topic.label)} question={q(open.item.n)} answer={a(open.item.n)}
          onClose={() => { const n = open.item.n; setOpen(null); sheet.focus(`help-${n}`); }} />
      ) : null}
    </div>
  );
}

/** The answer in a window of its own, fading and growing in (220 ms, 0.94 → 1); "Понятно" at the bottom right waits for OK. */
function HelpCard(p: { icon: string; topic: string; question: string; answer: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { setTimeout(() => focusFirst(root.current ?? document, "hlp-ok"), 0); }, []);
  // Where every path starts, in the app's language ("Настройки", "Каналы"), so the sketch is drawn in all of them.
  const parts = useMemo(() => parseAnswer(p.answer, new Set([t("sa_settings_title"), t("sa_content_key_channels")])), [p.answer]);
  const sketch = parts.path.length >= 2 || parts.keys.length > 0 || p.icon === "VIDEO";
  // ▲ ▼ scroll an answer taller than the window (the only control is the button; Android has no such case at 1080p).
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowUp" || e.keyCode === 38 ? -1 : e.key === "ArrowDown" || e.keyCode === 40 ? 1 : 0;
    const box = text.current;
    if (d === 0 || !box) return;
    e.preventDefault();
    e.stopPropagation();
    box.scrollTop += d * 120;
  };
  return (
    <OverSheet>
      <div ref={root}>
        <div class="st-layer hlp-layer" data-modal onClick={p.onClose}>
          <div class="hlp-card" role="dialog" aria-label={p.question} onClick={(e) => e.stopPropagation()} onKeyDown={onKey as never}>
            <div class="hlp-eyebrow">{p.topic.toLocaleUpperCase(lang())}</div>
            <div class="hlp-title">{p.question}</div>
            <div class="hlp-body">
              {sketch ? <div class="hlp-sketch"><Sketch answer={parts} /></div> : null}
              <div class="hlp-text" ref={text}>{parts.lines.map((l, i) => <Line key={i} line={l} />)}</div>
            </div>
            <div class="hlp-foot"><Button small id="hlp-ok" text={t("sa_help_got_it")} onClick={p.onClose} /></div>
          </div>
        </div>
      </div>
    </OverSheet>
  );
}

function Sketch({ answer }: { answer: HelpAnswer }) {
  if (answer.path.length >= 2) return <PathSketch path={answer.path} />;
  if (answer.keys.length > 0) return <RemoteSketch keys={answer.keys} />;
  return <StreamSketch />;
}

/** A small settings sheet: the first screen's name, then each step down to the item to press, lit as focus is. */
function PathSketch({ path }: { path: string[] }) {
  return (
    <div class="hlp-path">
      <div class="hlp-path-title">{path[0]}</div>
      {path.slice(1).map((step, i) => {
        const last = i === path.length - 2;
        return (
          <div key={i} class={`hlp-path-row${last ? " last" : ""}`} style={{ marginLeft: `${i * 10}px` }}>
            <span class="hlp-path-text">{step}</span>
            {last ? <KeyChip label="OK" lit /> : <span class="hlp-path-chev">›</span>}
          </div>
        );
      })}
    </div>
  );
}

/** The remote's arrows and OK, the ones the answer uses lit. */
function RemoteSketch({ keys }: { keys: string[] }) {
  const on = (k: string) => keys.indexOf(k) >= 0;
  return (
    <div class="hlp-remote">
      <span class="hlp-remote-up"><KeyChip label="▲" lit={on("▲")} /></span>
      <span class="hlp-remote-down"><KeyChip label="▼" lit={on("▼")} /></span>
      <span class="hlp-remote-left"><KeyChip label="◀" lit={on("◀")} /></span>
      <span class="hlp-remote-right"><KeyChip label="▶" lit={on("▶")} /></span>
      <KeyChip label="OK" lit={on("OK")} big />
    </div>
  );
}

function KeyChip(p: { label: string; lit: boolean; big?: boolean }) {
  return <span class={`hlp-key-chip${p.lit ? " lit" : ""}${p.big ? " big" : ""}`}>{p.label}</span>;
}

/** A sample of the info's stream line, as it reads under the picture (TvBoxStreamCorner.kt tvBoxStreamFacts). */
function StreamSketch() {
  const l = lang();
  const stereo = t("sa_help_sample_stereo");
  const mbps = (4700 / 1000).toLocaleString(l, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const facts = [t("sa_help_sample_fps", { 1: 50 }), "H.264", stereo.charAt(0).toLocaleUpperCase(l) + stereo.slice(1), t("sa_help_sample_mbps", { 1: mbps })]
    .join(t("sa_content_epg_bits_separator"));
  return (
    <div class="hlp-stream">
      <div class="hlp-stream-next">{t("sa_help_sample_next")}</div>
      <div class="hlp-stream-facts"><span class="hlp-stream-res">1080p</span><span class="hlp-stream-line">{facts}</span></div>
    </div>
  );
}

/** One line of the answer: a numbered step, a point, or plain text; keys and «menu items» picked out. */
function Line({ line }: { line: AnswerLine }) {
  const body = highlight(line.text).map((x, i) => (x.kind === "plain" ? x.text : <b key={i} class={x.kind === "key" ? "hlp-k" : "hlp-i"}>{x.text}</b>));
  if (line.kind === "step") return <div class="hlp-line step"><span class="hlp-step">{line.mark}</span><span class="hlp-line-text">{body}</span></div>;
  if (line.kind === "point") return <div class="hlp-line point"><span class="hlp-dot" /><span class="hlp-line-text">{body}</span></div>;
  return <div class="hlp-line plain">{body}</div>;
}

