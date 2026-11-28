/**
 * A Samsung Tizen TV draws the picture on its own plane under the page: the page must be see-through where the video is,
 * or the TV shows a flat lilac screen with the sound still playing (found on a UE75RU7100: the same stream was fine once
 * the page background over the video was transparent). While any <video> is playing, the root gets the class `video-on`;
 * ui.css then makes the page background transparent. When nothing plays the page keeps its own background.
 */
export function installVideoPlane(root: HTMLElement = document.documentElement): void {
  const sync = () => {
    const vs = document.getElementsByTagName("video");
    let playing = false;
    for (let i = 0; i < vs.length; i++) { const v = vs[i]; if (v && !v.paused && !v.ended && v.readyState > 1) { playing = true; break; } }
    root.classList.toggle("video-on", playing);
  };
  for (const ev of ["playing", "pause", "ended", "emptied", "error", "abort", "waiting"]) document.addEventListener(ev, sync, true);
  setInterval(sync, 2000); // an element taken off the page raises no event
}
