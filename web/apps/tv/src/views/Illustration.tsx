/** The first-run pictures, drawn in the app's own colours so they follow the theme. */
export type Pic = "tv" | "face" | "tags" | "link" | "done";

export function Illustration({ pic }: { pic: Pic }) {
  return (
    <svg class="illus" viewBox="0 0 320 200" width="320" height="200" aria-hidden="true">
      <ellipse cx="160" cy="188" rx="110" ry="8" fill="currentColor" opacity=".08" />
      {pic === "tv" ? (
        <>
          <rect x="62" y="30" width="196" height="124" rx="10" fill="#3b3f9b" />
          <rect x="70" y="38" width="180" height="108" rx="6" fill="#d9f0ff" />
          <path d="M70 120 L130 38 H160 L100 146 H70Z M170 146 L230 60 V90 L198 146Z" fill="#fff" opacity=".7" />
          <text x="160" y="104" text-anchor="middle" font-size="40" font-weight="800" fill="#3b3f9b" font-family="inherit">TV</text>
          <path d="M138 154 L128 178 H192 L182 154Z" fill="#5a5fc7" />
          <rect x="112" y="176" width="96" height="6" rx="3" fill="#3b3f9b" />
        </>
      ) : null}
      {pic === "face" ? (
        <>
          <circle cx="160" cy="76" r="38" fill="var(--accent)" opacity=".9" />
          <path d="M84 178 C88 128 126 112 160 112 C194 112 232 128 236 178Z" fill="var(--accent)" opacity=".55" />
          <circle cx="146" cy="72" r="4" fill="var(--page)" /><circle cx="174" cy="72" r="4" fill="var(--page)" />
          <path d="M146 90 Q160 102 174 90" stroke="var(--page)" stroke-width="4" fill="none" stroke-linecap="round" />
        </>
      ) : null}
      {pic === "tags" ? (
        <>
          {[0, 1, 2].map((i) => <rect key={i} x={70 + i * 6} y={44 + i * 38} width={150 - i * 12} height="28" rx="14" fill="var(--accent)" opacity={0.9 - i * 0.22} />)}
          <circle cx="250" cy="62" r="14" fill="#ff6b5e" /><circle cx="262" cy="108" r="10" fill="var(--accent)" opacity=".6" />
        </>
      ) : null}
      {pic === "link" ? (
        <>
          <rect x="84" y="34" width="152" height="124" rx="12" fill="var(--control)" stroke="var(--accent)" stroke-width="3" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x="104" y={56 + i * 24} width={i === 0 ? 70 : 112 - i * 10} height="10" rx="5" fill="var(--accent)" opacity={i === 0 ? 1 : 0.5} />)}
          <circle cx="232" cy="150" r="26" fill="var(--accent)" />
          <path d="M232 138 V162 M220 150 H244" stroke="var(--page)" stroke-width="6" stroke-linecap="round" />
        </>
      ) : null}
      {pic === "done" ? (
        <>
          <circle cx="160" cy="94" r="62" fill="var(--accent)" opacity=".22" />
          <circle cx="160" cy="94" r="44" fill="var(--accent)" />
          <path d="M138 96 L154 112 L184 78" stroke="var(--page)" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </>
      ) : null}
    </svg>
  );
}
