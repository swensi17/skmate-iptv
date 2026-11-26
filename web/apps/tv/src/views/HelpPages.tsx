import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { focusFirst, useOwnBack } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { highlight, parseAnswer, type AnswerLine } from "./helpAnswer";
import { OverSheet, SRow, useSheet } from "./SettingsKit";

/*
 * Как пользоваться (Android 2.5.8, features/more/HelpPage.kt): the questions as settings rows under their topics, in the
 * alphabet of the app's language inside each topic, each with a line on what it is about. OK opens the answer in a window
 * in the middle of the screen (HelpCard).
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
const d = (n: number) => t(`sa_help_d${n}` as Key);
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
          <SRow key={it.n} id={`help-${it.n}`} icon={it.icon} title={title} line={d(it.n)} onOk={() => setOpen({ topic: tp, item: it })} />
        )),
      ])}
      {open ? (
        <HelpCard question={q(open.item.n)} about={d(open.item.n)} answer={a(open.item.n)}
          onClose={() => { const n = open.item.n; setOpen(null); sheet.focus(`help-${n}`); }} />
      ) : null}
    </div>
  );
}

/**
 * The answer in a window of its own in the middle of the screen (2.5.7, HelpPage.kt helpCard): the question with a ✕
 * at the top right, what this is in one paragraph, where to go, the steps numbered 1, 2, 3 and one closing paragraph.
 * ▲ ▼ scroll a long answer; OK on ✕, Back or a click beside it close it and the focus returns to the question.
 */
function HelpCard(p: { question: string; about: string; answer: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { setTimeout(() => focusFirst(root.current ?? document, "hlp-close"), 0); }, []);
  // Where every path starts, in the app's language ("Настройки", "Каналы").
  const parts = useMemo(() => parseAnswer(p.answer, new Set([t("sa_settings_title"), t("sa_content_key_channels")])), [p.answer]);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowUp" || e.keyCode === 38 ? -1 : e.key === "ArrowDown" || e.keyCode === 40 ? 1 : 0;
    const box = text.current;
    if (d === 0 || !box) return;
    e.preventDefault();
    e.stopPropagation();
    box.scrollTop += d * SCROLL_STEP;
  };
  return (
    <OverSheet>
      <div ref={root}>
        <div class="st-layer hlp-layer" data-modal onClick={p.onClose}>
          <div class="hlp-card" role="dialog" aria-label={p.question} onClick={(e) => e.stopPropagation()} onKeyDown={onKey as never}>
            <div class="hlp-head">
              <div class="hlp-title">{p.question}</div>
              <button class="st-focusable hlp-close" data-focus="hlp-close" aria-label={t("tbClose")} onClick={p.onClose}>✕</button>
            </div>
            <div class="hlp-text" ref={text}>
              {p.about ? <div class="hlp-line plain">{p.about}</div> : null}
              {parts.lines.map((l, i) => <Line key={i} line={l} />)}
            </div>
          </div>
        </div>
      </div>
    </OverSheet>
  );
}

/** How far ▲ ▼ move a long answer. */
const SCROLL_STEP = 160;

/** One line of the answer: a numbered step, a point, or plain text; keys and «menu items» picked out. */
function Line({ line }: { line: AnswerLine }) {
  const body = highlight(line.text).map((x, i) => (x.kind === "plain" ? x.text : <b key={i} class={x.kind === "key" ? "hlp-k" : "hlp-i"}>{x.text}</b>));
  if (line.kind === "step") return <div class="hlp-line step"><span class="hlp-step">{line.mark}</span><span class="hlp-line-text">{body}</span></div>;
  if (line.kind === "path") return <div class="hlp-line path">{body}</div>;
  return <div class="hlp-line plain">{body}</div>;
}

