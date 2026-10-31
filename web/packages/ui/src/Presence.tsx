import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export const EXIT_MS = 220;

/**
 * Keeps what it shows on screen for a moment after [show] turns false, so it can leave smoothly instead of
 * vanishing. The content is a function of `closing`: it adds the exit animation while that is true.
 */
export function Presence(p: { show: boolean; ms?: number; children: (closing: boolean) => ComponentChildren }) {
  const [mounted, setMounted] = useState(p.show);
  const last = useRef(p.children);
  if (p.show) last.current = p.children;
  useEffect(() => {
    if (p.show) { setMounted(true); return; }
    const id = setTimeout(() => setMounted(false), p.ms ?? EXIT_MS);
    return () => clearTimeout(id);
  }, [p.show]);
  if (!p.show && !mounted) return null;
  return <>{last.current(!p.show)}</>;
}
