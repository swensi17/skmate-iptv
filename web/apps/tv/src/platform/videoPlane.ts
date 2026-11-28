/**
 * A Samsung Tizen TV draws the picture on its own plane under the page: the page must be see-through where the video is,
 * or the TV shows a flat lilac screen with the sound still playing (found on a UE75RU7100). But the plane is lilac (or
 * black) wherever nothing is drawn, so the page may be see-through ONLY over the picture: elsewhere the glass panels would
 * show the lilac through. While a video plays, the root gets the class `video-on` (ui.css makes the page itself transparent
 * and paints the page colour on a layer behind it, with a hole cut exactly where each playing <video> is: `--video-hole`).
 * While nothing plays (opening, a switch, an error) the page keeps its own opaque background, so no lilac or black flashes.
 * Short stalls ("waiting") do not end it, they would make the picture flicker.
 */
/** True when the element can really be seen: no ancestor is hidden, transparent or off the screen (a screen left behind keeps its <video> playing for a moment). */
function shown(v: HTMLVideoElement, r: DOMRect): boolean {
  if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return false;
  for (let el: HTMLElement | null = v, depth = 0; el && depth < 12; el = el.parentElement, depth++) {
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
  }
  return true;
}

export function installVideoPlane(root: HTMLElement = document.documentElement): void {
  let last = "";
  const sync = () => {
    const vs = document.getElementsByTagName("video");
    const holes: string[] = [];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v || v.paused || v.ended || v.readyState < 3 || !v.videoWidth) continue;
      const r = v.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || !shown(v, r)) continue;
      const x1 = Math.round(r.left), y1 = Math.round(r.top), x2 = Math.round(r.right), y2 = Math.round(r.bottom);
      holes.push(`${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px`);
    }
    const key = holes.join("|");
    if (key === last) return;
    last = key;
    if (!holes.length) { root.classList.remove("video-on"); root.style.removeProperty("--video-hole"); return; }
    root.style.setProperty("--video-hole", `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${holes.join(", ")})`);
    root.classList.add("video-on");
  };
  for (const ev of ["playing", "pause", "ended", "emptied", "error", "abort", "loadeddata", "resize"]) document.addEventListener(ev, sync, true);
  window.addEventListener("resize", sync);
  setInterval(sync, 500); // a moved or removed element raises no event
}
