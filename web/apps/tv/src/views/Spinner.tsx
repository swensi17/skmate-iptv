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
