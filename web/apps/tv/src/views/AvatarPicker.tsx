import { useEffect, useRef } from "preact/hooks";
import { focusFirst, Popup } from "@skmate/ui";
import { t } from "../i18n";
import { AVATARS, avatarSrc } from "../avatars";
import "./avatar.css";

/** A profile's picture: the avatar, or the initial letter when it has none. */
export function Avatar({ id, initial }: { id: number | undefined; initial: string }) {
  const src = avatarSrc(id);
  return src ? <img class="av-img" src={src} alt="" draggable={false} /> : <span>{initial}</span>;
}

/**
 * The avatar picker (Android shell/components/AvatarPickerDialog.kt): a popup "Choose your avatar" 760 wide, the "no
 * avatar" tile first, then the seven pictures in rows of five on 120 px tiles; the current one ringed and focused first;
 * OK picks it and closes. The own-picture tile of Android needs a file chooser the TV browser does not have: left out,
 * as Android leaves it out where the host has none.
 */
export function AvatarPicker(p: { selected: number | undefined; initial: string; closing: boolean; onSelect: (id: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cur = p.selected === undefined ? -1 : p.selected < 0 ? -1 : p.selected % AVATARS.length;
  useEffect(() => { focusFirst(box.current ?? document, `av-${cur}`); }, []);
  // The long press that opened the picker may still be held: its repeats must not pick the first tile.
  useEffect(() => {
    let armed = false;
    const down = (e: KeyboardEvent) => { if ((e.key === "Enter" || e.keyCode === 13) && e.repeat && !armed) { e.preventDefault(); e.stopPropagation(); } };
    const up = (e: KeyboardEvent) => { if (e.key === "Enter" || e.keyCode === 13) armed = true; };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
  }, []);
  return (
    <Popup title={t("kp_avatar_picker_title")} width={760} onClose={p.onClose} closing={p.closing}>
      <div class="av-grid" ref={box}>
        <button class={`st-focusable av-tile${cur === -1 ? " cur" : ""}`} data-focus="av--1" onClick={() => p.onSelect(-1)}>
          <span class="av-none">{p.initial}</span>
        </button>
        <div class="av-row">
          {AVATARS.map((src, i) => (
            <button key={i} class={`st-focusable av-tile${cur === i ? " cur" : ""}`} data-focus={`av-${i}`} onClick={() => p.onSelect(i)}>
              <img class="av-img" src={src} alt="" draggable={false} />
            </button>
          ))}
        </div>
      </div>
    </Popup>
  );
}
