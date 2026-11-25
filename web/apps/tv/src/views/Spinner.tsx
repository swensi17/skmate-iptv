import "./screens.css";

/** The loading spinner of an iPhone: twelve ticks round a circle, each fading after the one before. Sized by its parent. */
export function Ticks() {
  return (
    <svg class="ticks" viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: 12 }, (_, k) => (
        <rect key={k} x="46" y="6" width="8" height="26" rx="4" transform={`rotate(${k * 30} 50 50)`} style={{ animationDelay: `${(k - 12) * 100}ms` }} />
      ))}
    </svg>
  );
}

/** A spinner in the middle of the player or the preview; [on] fades it in (see `.spinner` in app.css). */
export function Spinner(p: { class?: string; label?: string }) {
  return <div class={`spinner ${p.class ?? ""}`.trim()} role="status" aria-label={p.label}><Ticks /></div>;
}

/**
 * Something is on its way (the guide, a list of films): the spinner, a title and an optional quieter line, in the middle
 * of the free space, with a short fade (see `.state` in screens.css).
 */
export function LoadingState(p: { title: string; hint?: string; class?: string }) {
  return (
    <div class={`empty-idle state ${p.class ?? ""}`.trim()} role="status" aria-live="polite">
      <div class="state-spin"><Ticks /></div>
      <div class="empty-title">{p.title}</div>
      {p.hint ? <div class="empty-hint">{p.hint}</div> : null}
    </div>
  );
}
