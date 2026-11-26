/*
 * Why a channel did not open, as the Android app names it (PlayerDiagnostics.kt PlayerErrors.classify and
 * LivePreviewEngine.probeWhy, 2.5.2 "понятная причина ошибки"): the engines' own words first, and when they say
 * nothing useful, one short request to the same address after the player gave up. The answer is the status
 * (404, 403 …) or that the server cannot be reached.
 */

/** The reasons a web engine or the probe can find (a subset of Android's PlayerFailureReason). */
export type FailureReason =
  | "http509" | "oneSession" | "http403" | "http401" | "http404" | "http400" | "ssl" | "format" | "network";

const HTTP_STATUS_RX = /(?:\bhttp(?: error)? |\bresponse code[:= ]+|\bstatus(?: code)?[:= ]+)(\d{3})\b/;

/** PlayerErrors.classify, the parts a browser can meet: HTTP statuses, certificates, a damaged stream, the network. */
export function classifyFailure(raw: string): FailureReason | null {
  const l = raw.toLowerCase();
  const code = HTTP_STATUS_RX.exec(l)?.[1];
  if (code === "509") return "http509";
  if (code === "429" || code === "458") return "oneSession";
  if (code === "403") return "http403";
  if (code === "401") return "http401";
  if (code === "404") return "http404";
  if (code === "400") return "http400";
  if (l.includes("certificate verify failed") || (l.includes("ssl") && l.includes("certif")) || l.includes("cert_")) return "ssl";
  if (l.includes("unrecognized file format") || l.includes("invalid data found")) return "format";
  if (l.includes("connection refused") || l.includes("connection reset") || l.includes("timed out") || l.includes("timeout")) return "network";
  return null;
}

/** The give-up probe's limit (Android PROBE_TIMEOUT_MS), and where a status starts meaning "the server failed". */
export const PROBE_TIMEOUT_MS = 4_000;
const HTTP_SERVER_ERROR = 500;

/** A status the probe got: its reason, a server error counting as "cannot reach the provider". */
export function reasonForStatus(status: number): FailureReason | null {
  return classifyFailure(`http error ${status}`) ?? (status >= HTTP_SERVER_ERROR ? "network" : null);
}

type FetchLike = (url: string, init?: { method?: string; mode?: "cors" | "no-cors"; signal?: AbortSignal; cache?: "no-store" }) =>
  Promise<{ status: number; type?: string; body?: { cancel?: () => Promise<void> } | null }>;

/**
 * One short request to [url] after the player gave up. The response's headers are enough: the body (a live stream
 * that never ends) is dropped at once. A page cannot tell a server that refuses cross-origin reading from one that
 * is down, so a failed request is asked again without CORS: an opaque answer means the server is there (the status
 * stays unknown, no reason), a second failure that it cannot be reached. Android sends the playlist's User-Agent and
 * Referer; a browser forbids both, so the TV's own go.
 */
export async function probeFailure(url: string, fetchFn: FetchLike | null = typeof fetch === "function" ? (fetch as unknown as FetchLike) : null, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ reason: FailureReason | null; raw: string }> {
  if (!fetchFn || !/^https?:/i.test(url)) return { reason: null, raw: "" };
  let timedOut = false;
  // Chromium 63 (Tizen 5) has no AbortController: the limit is a race there, and the late answer is dropped.
  const once = (mode: "cors" | "no-cors") => new Promise<{ status: number }>((resolve, reject) => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { timedOut = true; ctl?.abort(); reject(new Error("timeout")); }, timeoutMs);
    fetchFn(url, { method: "GET", mode, cache: "no-store", ...(ctl ? { signal: ctl.signal } : {}) }).then(
      (res) => {
        clearTimeout(timer);
        try { void res.body?.cancel?.().catch(() => undefined); } catch { /* nothing to drop */ }
        resolve(res);
      },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
  try {
    const res = await once("cors");
    return { reason: reasonForStatus(res.status), raw: `http error ${res.status}` };
  } catch { /* blocked or unreachable: asked once more without CORS */ }
  // No answer within the limit: the server is not reachable (Android's "network timeout").
  if (timedOut) return { reason: "network", raw: "network timeout" };
  try {
    await once("no-cors");
    return { reason: null, raw: "opaque" };
  } catch {
    return { reason: "network", raw: "network timeout" };
  }
}
