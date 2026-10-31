import qrcode from "qrcode-generator";

/** A QR code as one SVG: the address of a link, for a phone to open it (a TV has no browser). */
export function Qr({ text, size = 360 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} role="img" aria-label={text} shape-rendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
