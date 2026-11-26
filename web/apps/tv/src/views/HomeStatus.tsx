import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { clock } from "../time";

/*
 * The top-right cluster of the shell (Android features/shell/components/StageStatus.kt StageClock, TV-box look):
 * [weather mark 42] [date over "9° Tashkent", 19/600 muted] [6] [time 40/700], each changed character rolling up.
 * Weather as Android's WeatherRepository: the approximate place from a free IP-location service (three tried in turn),
 * then Open-Meteo's current weather; both are free and need no key. Kept 30 minutes (here in localStorage too, so a
 * restart does not ask again). Nothing is shown for the weather when it cannot be had: the date and time stay.
 * Settings › Дата, время и погода (WeatherSettingsScreen.kt): weather off hides only the mark and the degrees; a typed
 * place is "lat,lon" or a city found with Open-Meteo's geocoding; °F = trunc(°C × 9/5 + 32); each line has its colour.
 */

export interface Weather { temperatureC: number; city: string; code: number; isDay: boolean }

const CACHE_KEY = "skmate.weather";
const CACHE_MS = 30 * 60_000;
const IP_LOCATORS: Array<[string, string, string]> = [
  ["https://ipapi.co/json/", "latitude", "longitude"],
  ["https://ipwho.is/", "latitude", "longitude"],
  ["http://ip-api.com/json/", "lat", "lon"],
];

async function getJson(url: string, ms = 8000): Promise<Record<string, unknown>> {
  // fetch with a timeout; XMLHttpRequest-free: Chromium 63 has fetch, not AbortController (66), so a race does it.
  return Promise.race([
    fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Record<string, unknown>>; }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/** "41.3, 69.28" as a place (WeatherRepository.kt: exactly two numbers split by a comma); null for anything else. */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const parts = text.split(",");
  if (parts.length !== 2) return null;
  const a = parts[0]!.trim(), b = parts[1]!.trim();
  const num = /^-?\d+(\.\d+)?$/;
  if (!num.test(a) || !num.test(b)) return null;
  const lat = Number(a), lon = Number(b);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** The degrees shown: whole °C, or °F as Android counts them (trunc(c × 9/5 + 32)). */
export function degrees(c: number, unit: "c" | "f"): number {
  return Math.trunc(unit === "f" ? (c * 9) / 5 + 32 : c) || 0; // never "-0"
}

/** Where to look: the typed place (coordinates, or a city by name), else the TV's approximate place by its address. */
async function locate(place: string): Promise<{ lat: number; lon: number; city: string }> {
  const typed = place.trim();
  if (typed) {
    const ll = parseLatLon(typed);
    if (ll) return { ...ll, city: typed };
    const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(typed)}&count=1&language=en&format=json`);
    const first = (g.results as Array<Record<string, unknown>> | undefined)?.[0];
    if (!first || !isFinite(Number(first.latitude)) || !isFinite(Number(first.longitude))) throw new Error("place not found");
    return { lat: Number(first.latitude), lon: Number(first.longitude), city: String(first.name ?? typed) };
  }
  for (const [url, latKey, lonKey] of IP_LOCATORS) {
    let loc: Record<string, unknown>;
    try { loc = await getJson(url); } catch { continue; }
    const lat = Number(loc[latKey]);
    const lon = Number(loc[lonKey]);
    if (!isFinite(lat) || !isFinite(lon) || loc[latKey] === undefined) continue;
    return { lat, lon, city: String(loc.city ?? loc.region ?? "") };
  }
  throw new Error("no IP location");
}

async function fetchWeather(place: string): Promise<Weather> {
  const { lat, lon, city } = await locate(place);
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`);
  const cur = w.current as Record<string, unknown> | undefined;
  if (!cur) throw new Error("no current weather");
  return { temperatureC: Number(cur.temperature_2m), city, code: Number(cur.weather_code), isDay: Number(cur.is_day ?? 1) === 1 };
}

/** The kept weather, only if it was looked up for this same place. */
function readCache(place: string): { at: number; w: Weather } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const c = raw ? JSON.parse(raw) as { at: number; w: Weather; place?: string } : null;
    return c && (c.place ?? "") === place.trim() ? c : null;
  } catch { return null; }
}

/** The weather for [place] ("" = by the TV's address), refreshed every 30 minutes; null while off, unknown or unreachable. */
export function useWeather(on = true, place = ""): Weather | null {
  const [w, setW] = useState<Weather | null>(() => (on ? readCache(place)?.w ?? null : null));
  useEffect(() => {
    if (!on) { setW(null); return; }
    let alive = true;
    setW(readCache(place)?.w ?? null);
    const run = () => {
      const c = readCache(place);
      if (c && Date.now() - c.at < CACHE_MS) { if (alive) setW(c.w); return; }
      fetchWeather(place).then((fresh) => {
        if (!alive) return;
        setW(fresh);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), w: fresh, place: place.trim() })); } catch { /* kept in memory only */ }
      }, () => { /* offline, refused or no such place: the clock stays without weather (or with the last one) */ });
    };
    run();
    const id = setInterval(run, CACHE_MS);
    return () => { alive = false; clearInterval(id); };
  }, [on, place]);
  return w;
}

/** A line's colour: "" as designed, "accent" the live accent, or a hex (WeatherSettingsScreen.kt clock colours). */
export function statusColor(v: string): string | undefined {
  if (v === "accent") return "var(--st-accent)";
  if (v === "text") return "var(--st-text)";
  if (v === "muted") return "var(--st-muted)";
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

/** "ср, 25 нояб." as Android's getBestDateTimePattern(locale, "EEEdMMM"). */
function dateText(ms: number): string {
  const lang = document.documentElement.lang || "en";
  try { return new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }).format(new Date(ms)); } catch { return new Date(ms).toDateString(); }
}

/** [text] whose changed characters roll up into place (StageStatus.kt RollingText, 420 ms): only the new ones move. */
function Rolling({ text, class: cls, style }: { text: string; class: string; style?: { color: string } }) {
  const prev = useRef(text);
  const was = prev.current;
  useEffect(() => { prev.current = text; }, [text]);
  return (
    <span class={cls} style={style}>
      {Array.from(text).map((ch, i) => {
        const changed = was !== text && Array.from(was)[i] !== ch;
        // A changed character gets a new key, so its element is new and its roll-in animation runs once.
        return <span key={changed ? `${i}:${ch}:${text}` : `${i}:${ch}`} class={changed ? "roll" : undefined}>{ch}</span>;
      })}
    </span>
  );
}

/** The clock, the date and the weather at the top right of every screen but the full-screen player and Settings. */
export function HomeStatus({ look }: { look?: StatusLook }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const w = useWeather(look?.weatherOn ?? true, look?.weatherPlace ?? "");
  const color = (v: string | undefined) => { const c = statusColor(v ?? ""); return c ? { color: c } : undefined; };
  return (
    <div class="home-status" aria-hidden="true">
      {w ? <WeatherIcon w={w} /> : null}
      <div class="home-status-lines">
        <Rolling class="home-status-sub" text={dateText(now)} style={color(look?.clockDateColor)} />
        {w ? <Rolling class="home-status-sub" style={color(look?.clockWeatherColor)}
          text={t("homeWeatherCity", { t: degrees(w.temperatureC, look?.tempUnit ?? "c"), city: w.city }).trim()} /> : null}
      </div>
      <Rolling class="home-status-time" text={clock(now)} style={color(look?.clockTimeColor)} />
    </div>
  );
}

/** What the cluster reads from Settings › Дата, время и погода. */
export interface StatusLook {
  weatherOn: boolean;
  weatherPlace: string;
  tempUnit: "c" | "f";
  clockTimeColor: string;
  clockDateColor: string;
  clockWeatherColor: string;
}

/* ---- The weather mark: Android's WeatherConditionIcon.kt and SkyPhase.kt, drawn as SVG on its 100-unit square. ---- */

function smooth(x: number, from: number, to: number): number {
  const k = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return k * k * (3 - 2 * k);
}
function lerp(a: [number, number, number], b: [number, number, number], k: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + ((b[i] as number) - v) * k)).join(",")})`;
}
const DAWN: [number, number, number] = [0xff, 0x9f, 0x43];
const NOON: [number, number, number] = [0xff, 0xd1, 0x66];
const DUSK: [number, number, number] = [0xff, 0x6b, 0x4a];

function sky(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const sun = smooth(h, 4.5, 6.5) * (1 - smooth(h, 19.5, 21.5));
  const color = h < 12 ? lerp(DAWN, NOON, smooth(h, 6, 11)) : lerp(NOON, DUSK, smooth(h, 14, 19));
  const height = smooth(h, 5, 10) * (1 - smooth(h, 16, 20.5));
  return { sun, moon: 1 - sun, color, rays: 0.45 + 0.55 * height, horizon: (1 - height) * sun };
}

function symbolKey(w: Weather): string {
  const c = w.code;
  if (c === 0) return w.isDay ? "sunny" : "clearNight";
  if (c >= 1 && c <= 2) return w.isDay ? "partlyDay" : "partlyNight";
  if (c === 3) return "cloudy";
  if (c >= 45 && c <= 48) return "fog";
  if (c >= 51 && c <= 57) return "drizzle";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return "snow";
  if (c >= 95 && c <= 99) return "thunder";
  return "cloudy";
}

const CLOUD = "#DDEFE9";
const RAIN = "#76A7FF";
const SNOW = "#F0FCFF";
const FOG = "#DDF8FF";
const THUNDER = "#FFD166";

function WeatherIcon({ w }: { w: Weather }) {
  const d = new Date();
  const hour = d.getHours() + d.getMinutes() / 60;
  // A forecast that says "day" at an hour the clock calls night (or the reverse) wins: the sky follows the data.
  const shown = w.isDay && (hour < 6 || hour >= 20) ? 12 : !w.isDay && hour >= 7 && hour <= 19 ? 22 : hour;
  const s = sky(shown);
  const light = document.documentElement.dataset.theme === "light";
  const moonC = light ? "#8A9BC4" : "#DDF8FF";
  const parts: JSX.Element[] = [];
  let n = 0;
  const sun = (cx: number, cy: number, r: number) => {
    if (s.sun <= 0.01) return;
    const rr = r * (0.8 + 0.2 * s.sun);
    const inner = rr + 8; const outer = rr + 8 + 12 * s.rays;
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      parts.push(<line key={n++} x1={cx + Math.cos(a) * inner} y1={cy + Math.sin(a) * inner} x2={cx + Math.cos(a) * outer} y2={cy + Math.sin(a) * outer} stroke={s.color} stroke-opacity={s.sun} stroke-width={4} stroke-linecap="round" />);
    }
    parts.push(<circle key={n++} cx={cx} cy={cy} r={rr} fill={s.color} fill-opacity={s.sun} />);
    if (s.horizon > 0.02) parts.push(<line key={n++} x1={cx - 40} y1={cy + rr + 14} x2={cx + 40} y2={cy + rr + 14} stroke={s.color} stroke-opacity={0.8 * s.horizon} stroke-width={4} stroke-linecap="round" />);
  };
  const moon = (cx: number, cy: number, r: number) => {
    if (s.moon <= 0.01) return;
    const rr = r * (0.8 + 0.2 * s.moon) * 1.25;
    const br = rr * 0.86; const bx = cx + rr * 0.5; const by = cy - rr * 0.2;
    const id = `bite${n}`;
    parts.push(
      <g key={n++}>
        <mask id={id}><rect x="0" y="0" width="100" height="100" fill="#fff" /><circle cx={bx} cy={by} r={br} fill="#000" /></mask>
        <circle cx={cx} cy={cy} r={rr} fill={moonC} fill-opacity={s.moon} mask={`url(#${id})`} />
      </g>,
    );
    for (const [dx, dy] of [[0.62, -0.55], [0.3, -0.72], [0.74, 0.12]] as const) {
      parts.push(<circle key={n++} cx={cx + dx * rr * 0.9} cy={cy + dy * rr * 0.9} r={1.8} fill={moonC} fill-opacity={0.7 * s.moon} />);
    }
  };
  const cloud = (cx: number, cy: number, k: number) => {
    for (const [dx, dy, r] of [[-19, 5, 16], [0, -9, 23], [24, 2, 18], [39, 10, 13]] as const) {
      parts.push(<circle key={n++} cx={cx + dx * k} cy={cy + dy * k} r={r * k} fill={CLOUD} />);
    }
  };
  const drops = (cx: number, cy: number, count: number, c: string, o = 1) => {
    for (let i = 0; i < count; i++) parts.push(<line key={n++} x1={cx + i * 18} y1={cy} x2={cx - 5 + i * 18} y2={cy + 18} stroke={c} stroke-opacity={o} stroke-width={4} stroke-linecap="round" />);
  };
  const snow = (cx: number, cy: number) => {
    for (let i = 0; i < 3; i++) {
      const x = cx + i * 20; const y = cy + (i % 2) * 4;
      for (const [x1, y1, x2, y2] of [[-7, 0, 7, 0], [0, -7, 0, 7], [-5, -5, 5, 5], [5, -5, -5, 5]] as const) {
        parts.push(<line key={n++} x1={x + x1} y1={y + y1} x2={x + x2} y2={y + y2} stroke={SNOW} stroke-width={3} stroke-linecap="round" />);
      }
    }
  };
  const fog = (cx: number, cy: number) => {
    for (let i = 0; i < 4; i++) parts.push(<line key={n++} x1={cx - 38} y1={cy + i * 12} x2={cx + 38} y2={cy + i * 12} stroke={FOG} stroke-opacity={0.74} stroke-width={5} stroke-linecap="round" />);
  };
  const bolt = (cx: number, cy: number) => {
    parts.push(<path key={n++} d={`M${cx},${cy}L${cx - 12},${cy + 26}L${cx + 1},${cy + 23}L${cx - 8},${cy + 48}L${cx + 18},${cy + 15}L${cx + 4},${cy + 18}Z`} fill={THUNDER} />);
  };
  switch (symbolKey(w)) {
    case "sunny": case "clearNight": sun(50, 50, 23); moon(50, 50, 23); break;
    case "partlyDay": case "partlyNight": sun(36, 36, 17); moon(36, 36, 17); cloud(56, 60, 1); break;
    case "fog": cloud(50, 36, 0.9); fog(50, 58); break;
    case "drizzle": cloud(50, 38, 1); drops(35, 62, 3, RAIN, 0.72); break;
    case "rain": cloud(50, 36, 1.05); drops(30, 60, 4, RAIN); break;
    case "snow": cloud(50, 36, 1.05); snow(32, 65); break;
    case "thunder": cloud(50, 35, 1.05); bolt(52, 48); drops(28, 66, 2, RAIN); break;
    default: cloud(46, 48, 1.15); cloud(60, 62, 0.82);
  }
  return <svg class="home-status-icon" viewBox="0 0 100 100" width={42} height={42} aria-hidden="true">{parts}</svg>;
}
