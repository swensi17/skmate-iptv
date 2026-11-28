# Compact layout (tablets and phones): rules for screen authors

The app has two layouts. The **TV** layout is the fixed 1728x972 stage scaled by `fitStage` (Tizen, webOS, desktop at
1920x1080): it must not change. The **compact** layout is for the Android APK on tablets and phones: `#app` is the
window itself, sizes are CSS px of the device, input is a finger.

## Who decides

`packages/ui/src/layout.ts` (`decideLayout`, called by `installLayout()` in `main.tsx`):

1. `?layout=tv` or `?layout=compact` in the URL wins (for testing).
2. A Tizen / webOS user agent: `tv`.
3. `window.Capacitor` (the Android shell): `compact`.
4. A window at least 1280 CSS px wide with a fine pointer (mouse): `tv`.
5. A coarse pointer (touch) or a smaller side under 900 CSS px: `compact`. Otherwise `tv`.

`index.html` has a tiny inline script with the part it can know before the first paint (1, 2, 3, touch screen) and it
only sets the viewport meta (`width=device-width, initial-scale=1, viewport-fit=cover`; the TV keeps `width=1920`).

`installLayout()` writes these attributes on `<html>` and keeps them current on resize / rotation / input:

| attribute | values | meaning |
|---|---|---|
| `data-layout` | `tv` / `compact` | the layout |
| `data-orient` | `portrait` / `landscape` | height > width is portrait |
| `data-size` | `phone` / `tablet` | smaller side under 600 CSS px = phone (use in compact only) |
| `data-input` | `touch` / `key` / `mouse` | the input used last (a TV starts as `key`, a touch device as `touch`) |

## From TypeScript

```ts
import { useLayout, getLayout, isCompact, onSwipe } from "@skmate/ui";
const { layout, compact, orient, size, input } = useLayout(); // the component is redrawn when any of them changes
```

- `useLayout()`: Preact hook, returns `{ layout, compact, orient, size, input }`.
- `getLayout()` / `isCompact()`: the same without a hook (event handlers, non-components).
- Pure helpers, unit-tested: `decideLayout(env)`, `orientOf(w,h)`, `sizeOf(w,h)`, `initialInput(layout, coarse)`.
- `onSwipe(el | document, cb)` (touch.ts): reports a quick, straight drag as `{ dir: "left|right|up|down", dx, dy, ms, fromEdge: "left|right|null" }`.
  `fromEdge` is set when the finger started within 24 px of a window edge (swipe-from-left-edge = open the menu). It does not cancel taps or scrolls.
  Pure core: `swipeOf(dx, dy, ms, startX, width)`.
- Prefer CSS to `useLayout()`; use the hook only when the markup itself differs (a bottom bar instead of a rail).

## Adding the compact CSS of a screen

Rules:

- **Never edit the TV rules.** Add a block at the *end of your screen's CSS* (or in a new file imported after `app.css`)
  where every selector starts with `:root[data-layout="compact"]`. That alone keeps the TV untouched and avoids merge conflicts (each screen owns its own block).
- Specificity: `:root[data-layout="compact"] .x` (0,3,0) already beats `.x` (0,1,0) and `.a .b` (0,2,0). Do not use `!important`.
- Do not use `px` designed for 1728 wide. Use the tokens below; for a screen-specific number use `calc(var(--u) * n)`.
- Portrait vs landscape: `:root[data-layout="compact"][data-orient="portrait"] .x { ... }`; phone vs tablet: `[data-size="phone"]`.
  Plain `@media` also works; keep `data-*` so a test with `?layout=compact` behaves the same as the device.
- Chromium 63 / WebView 95: no `dvh`, no `aspect-ratio` without the PostCSS fallback (the legacy plugin in
  `apps/tv/postcss` adds flex `gap` and `inset` fallbacks; it keeps working for the compact blocks), no `:focus-visible`.
  `env(safe-area-inset-*)` is fine through the `--safe-*` tokens (they are `0px` where unsupported).
- Animate only `transform` and `opacity`.

Example:

```css
:root[data-layout="compact"] .live { flex-direction: column; gap: var(--u); padding: 0 var(--pad-r) 0 var(--pad-x); }
:root[data-layout="compact"] .groups { width: auto; flex: none; }
:root[data-layout="compact"] .lrow { min-height: var(--row-c); }
:root[data-layout="compact"][data-orient="landscape"] .live { flex-direction: row; }
```

## Tokens (`tokens.css`, defined on `:root[data-layout="compact"]`)

| token | tablet | phone | use |
|---|---|---|---|
| `--u` | 8px | 8px | spacing unit |
| `--touch-min` | 48px | 48px | min height/width of anything tappable |
| `--gutter` | 16px | 12px | side margin of a screen |
| `--pad-x`, `--pad-r` | gutter + left / right safe inset | | horizontal padding of a screen (cutouts) |
| `--row-c` | 56px | 52px | height of a list row (not `--row-h`: the TV's `--row-h` is set by the app) |
| `--fs-small` / `--fs-body` / `--fs-title` / `--fs-head` | 13 / 16 / 20 / 26 px | 13 / 15 / 18 / 22 px | type scale |
| `--r-card` | 12px | 12px | corners of cards, popups, sheets |
| `--safe-top/right/bottom/left` | `env(safe-area-inset-*)` or `0px`, defined on every layout | | notches, gesture bars: pad fixed bars with them |

## What the foundation already does (do not repeat it)

- `#app` is `position: fixed; inset 0`, no transform, no `--stage-*` (`fitStage` returns at once in compact and removes them). It follows the
  window, so when the soft keyboard opens the window shrinks (Android `adjustResize`) and everything is re-laid out. The TV's keyboard guard in `fitStage` stays for `tv` only.
  There is no `100dvh`: fixed + `top/bottom: 0` does the same on Chromium 63 and 95.
- Popups: `.st-popup-layer` has 16 px margins plus safe insets, `.st-popup` is `width: 100%` up to 560 px, scrolls if taller than the window.
  `TextEntry` keeps its `top` mode while the window is short (keyboard), so the field stays visible. `.st-sheet` is full width up to 480 px (full screen on a phone).
  `.st-button`, `.st-tool`, `.st-search` and popup buttons are at least `--touch-min` high.
- Touch (any layout, whenever `data-input="touch"`):
  - the focus plate and the lift/scale do not stay on a tapped item (`:focus` is unchanged for keys: when a key is pressed `data-input` becomes `key` and focus is drawn again).
    This is done by variables (`--focus-fill: transparent`, the plate's inverted palette handed back) plus a few explicit rules for controls that have a slab at rest.
    A **screen's own** focused style that does not use `--focus-fill`, `.st-focusable` or a rule listed in `ui.css` ("Touch") still shows on tap:
    add `:root[data-input="touch"] .your-class:focus { ...idle look... }`. `:active` dims any `[data-focus]` to 0.7 opacity as tap feedback.
  - a tap on any `[data-focus]` is an ordinary `click` (verified: a tapped channel row opened the player). `touch-action: manipulation` removes the 300 ms wait and double-tap zoom.
  - no text selection (inputs excepted), no tap highlight, no browser menu on long press; `contextmenu` is no longer a Back or a Cancel when `data-input="touch"`
    (`installDpad`, `TextEntry`). Add the same guard to any new `contextmenu` handler.
  - no pull-to-refresh / overscroll glow (`overscroll-behavior`), inner scrollers `contain` it.
- Scrolling by finger: `VirtualList` drags with momentum (touch events, `top` only, rows just slide; the click that ends a drag is swallowed; a tap during a glide stops it).
  Native `overflow-y: auto` boxes (`.st-sheet-body`, `.st-panel-body`, `.st-menu-list`, `.st-popup`, `.drawer-scroll`, `.vod-cats`, `.vd-episodes`, `.mv-groups`) scroll natively.
  A new scroll container: `overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y`. Containers that scroll only by script (guide grid, `overflow: hidden` + `scrollTop`) need a screen-agent decision: make them `overflow: auto` in compact.
  Open items found: `.scroll` (overflow hidden), the guide grid, `Terms`/`HelpPages`/`UpdateDialog` (scroll by keys only; in compact give them `overflow-y: auto`).
- Android Back button (`apps/tv/src/platform/android.ts`, `installAndroidBack`): the hardware Back dispatches the same `keydown Escape` that `isBack()` recognises, to the focused element, so
  `installDpad`'s Back (dialogs, player, sections) runs as for the remote. The app leaves through its own `exitApp()` (second Back on the channels screen, held Back, lock screen), which calls Capacitor `App.exitApp()`.
  Outside the shell nothing is installed.

## Testing

Dev server: `http://127.0.0.1:5173/?layout=compact` (the URL override works in any desktop browser). In the Browser pane (`resize_window`):

| device | size |
|---|---|
| Galaxy Tab 4 7" landscape | 960x600 (the real CSS size; 1280x800 is also fine for layout) |
| tablet, portrait | 800x1280 |
| phone | 412x915 |
| soft keyboard open | the same width, height about 40% shorter |

Check, per screen: no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`), every tappable at least 48 px (`getBoundingClientRect`), nothing clipped.
Simulate touch: dispatch `touchstart` on `document` (sets `data-input="touch"`), or set `document.documentElement.dataset.input = "touch"`. Keys set `key`, mouse movement `mouse`.
Also open the same screen at `?layout=tv` 1920x1080 and compare: it must be identical to before. Unit tests: `npx vitest run --exclude "**/stress/**"`, `npm run typecheck`.

Not verifiable without the device: real finger momentum feel on the 1.3 GB tablet, the hardware Back through Capacitor, `env()` insets on a cutout phone, the soft keyboard resize in the APK.
