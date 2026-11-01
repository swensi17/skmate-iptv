// SkMate IPTV for Windows: the web version of the player (../web, the same build as on LG and Samsung) in its own
// window, with an installer and updates from this repository's GitHub releases.
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require("electron");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { execFileSync, spawn } = require("node:child_process");
const { join } = require("node:path");
const { autoUpdater } = require("electron-updater");
const { record } = require("./recorder.cjs");
const stalker = require("./stalker.cjs");
const companion = require("./companion.cjs");

const SMOKE = process.env.SKMATE_SMOKE === "1"; // a check run: load the page, report, quit
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 5_000;
const STAGE_W = 1920; // the page is drawn for a 1920×1080 TV screen
const STAGE_H = 1080;

let win = null;
// Hosts that Stalker links point to: their streams get the MAG User-Agent too, as on Android.
const stalkerHosts = new Set();
// The local server of Stalker portals (stalker.cjs); its port is fixed so the addresses in a saved list stay good.
const STALKER_PORT = 47817;
let stalkerServer = null;
// "From another device": the server a phone or another SkMate reaches over Wi-Fi (companion.cjs); one at a time.
let companionServer = null;
const toPage = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };

// One window: a second start brings the first one forward instead of opening another player.
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
  app.on("window-all-closed", () => app.quit());
}

/**
 * A browser page may not read a playlist or a guide from a server that sends no CORS headers; most IPTV servers do
 * not. The window only ever shows our own bundled page, so it may read any http(s) address: the answer gets the
 * header it lacks, and the request leaves without the "null" origin a file page would send.
 */
function openToProviders() {
  const filter = { urls: ["http://*/*", "https://*/*"] };
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, done) => {
    const headers = { ...details.requestHeaders };
    if (headers.Origin === "null" || headers.Origin === "file://") delete headers.Origin;
    try { if (stalkerHosts.has(new URL(details.url).host)) headers["User-Agent"] = stalker.DEFAULT_MAG_USER_AGENT; } catch { /* not a URL */ }
    done({ requestHeaders: headers });
  });
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, done) => {
    const headers = { ...details.responseHeaders };
    const has = Object.keys(headers).some((k) => k.toLowerCase() === "access-control-allow-origin");
    if (!has) headers["Access-Control-Allow-Origin"] = ["*"];
    done({ responseHeaders: headers });
  });
}

/**
 * Full screen or a window, as the person left it. The first start is a maximized window with the usual Windows
 * buttons; full screen is the button in the app, F11 or Alt+Enter.
 */
const statePath = () => join(app.getPath("userData"), "window-state.json");
function loadFullScreen() {
  try { return JSON.parse(readFileSync(statePath(), "utf8")).fullScreen === true; } catch { return false; }
}
function saveFullScreen(fullScreen) {
  try { writeFileSync(statePath(), JSON.stringify({ fullScreen })); } catch { /* the next start is full screen again */ }
}

/**
 * The page's 1920×1080 design is fitted to the window by Chromium's own zoom, not by stretching a picture of it:
 * letters are laid out again at the screen's real pixels (Windows display scaling included), so they stay sharp.
 * The page then sees a window of at least 1920×1080 and needs no scaling of its own.
 */
function fitZoom() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  if (w <= 0 || h <= 0) return;
  win.webContents.setZoomFactor(Math.min(w / STAGE_W, h / STAGE_H));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false,
    backgroundColor: "#121212",
    title: "SkMate IPTV",
    icon: join(__dirname, "resources", "icon.ico"), // not a "build" folder: cleaners and .gitignore treat those as throwaway
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
      preload: join(__dirname, "preload.cjs"),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(join(__dirname, "app", "index.html"));
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined); // no pinch or Ctrl+wheel zoom on top of fitZoom
  win.webContents.on("did-finish-load", fitZoom);
  win.on("resize", fitZoom);
  const fullScreenChanged = (on) => { fitZoom(); saveFullScreen(on); win.webContents.send("full-screen", on); };
  win.on("enter-full-screen", () => fullScreenChanged(true));
  win.on("leave-full-screen", () => fullScreenChanged(false));

  // Links the app shows (Telegram, GitHub) open in the system browser, never inside the player window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) { e.preventDefault(); shell.openExternal(url); }
  });

  // F11 and Alt+Enter: full screen, as in a video player. Esc stays the app's Back key. Ctrl with +, - or 0 would
  // undo fitZoom, so those do nothing.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.control && ["+", "=", "-", "0"].includes(input.key)) { e.preventDefault(); return; }
    if (input.key === "F11" || (input.alt && input.key === "Enter")) {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.once("ready-to-show", () => {
    if (SMOKE) return;
    win.maximize();
    if (loadFullScreen()) win.setFullScreen(true);
    win.show();
  });
  win.on("closed", () => { win = null; });

  if (SMOKE) {
    win.webContents.on("console-message", (_e, level, message) => { if (level >= 3) console.log(`[page error] ${message}`); });
    win.webContents.once("did-finish-load", async () => {
      await new Promise((r) => setTimeout(r, 2500));
      const text = await win.webContents.executeJavaScript("document.body.innerText.slice(0, 120)");
      console.log(`[smoke] loaded: ${JSON.stringify(text)}`);
      const fit = await win.webContents.executeJavaScript(
        `innerWidth + "×" + innerHeight + ", stage scale " + document.documentElement.style.getPropertyValue("--stage-scale")
          + ", full-screen button " + (window.skmateDesktop ? "on" : "missing")`,
      );
      console.log(`[smoke] window ${win.getContentSize().join("×")}, zoom ${win.webContents.getZoomFactor().toFixed(3)}, page ${fit}`);
      // SKMATE_SMOKE_SHOT: a picture of the window, to look at how sharp the page is drawn.
      if (process.env.SKMATE_SMOKE_SHOT) writeFileSync(process.env.SKMATE_SMOKE_SHOT, (await win.webContents.capturePage()).toPNG());
      // SKMATE_SMOKE_URL: a server without CORS headers must still be readable from the page.
      const probe = process.env.SKMATE_SMOKE_URL;
      if (probe) {
        const got = await win.webContents.executeJavaScript(
          `fetch(${JSON.stringify(probe)}).then((r) => "HTTP " + r.status + ", " + r.headers.get("content-length") + " bytes").catch((e) => "blocked: " + e)`,
        );
        console.log(`[smoke] fetch ${probe}: ${got}`);
      }
      app.quit();
    });
    win.webContents.once("did-fail-load", (_e, code, desc) => { console.log(`[smoke] failed: ${code} ${desc}`); app.exit(1); });
  }
}

/**
 * Updates from GitHub releases, the way the Android app does it: the new version downloads in the background while
 * the player keeps going, then a window offers Install now or Later. Later installs it when the app is closed.
 */
function setUpUpdates() {
  if (SMOKE || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (e) => console.warn("update check failed:", e && e.message));
  autoUpdater.on("update-downloaded", async (info) => {
    const ru = app.getLocale().startsWith("ru");
    const { response } = await dialog.showMessageBox(win ?? undefined, {
      type: "info",
      title: "SkMate IPTV",
      message: ru ? `Вышла версия ${info.version}` : `Version ${info.version} is out`,
      detail: ru
        ? "Обновление скачано. Установить сейчас? Приложение закроется и откроется снова, плейлисты и настройки сохранятся."
        : "The update is downloaded. Install it now? The app closes and opens again; playlists and settings are kept.",
      buttons: ru ? ["Установить", "Позже"] : ["Install", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, UPDATE_EVERY_MS);
}

/**
 * VLC and mpv on this computer, as the Android app's external player: where they are installed by default, or on PATH.
 * SKMATE_PLAYERS (JSON {"vlc": "/path"}) replaces the search, for a check run on a machine without them.
 */
function findPlayers() {
  if (process.env.SKMATE_PLAYERS) { try { return JSON.parse(process.env.SKMATE_PLAYERS); } catch { return {}; } }
  const onPath = (name) => {
    try {
      const out = execFileSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8", windowsHide: true });
      return out.split(/\r?\n/)[0].trim() || null;
    } catch { return null; }
  };
  const first = (paths) => paths.find((p) => p && existsSync(p)) ?? null;
  const pf = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
  const found = {
    vlc: first([...pf.map((d) => join(d, "VideoLAN", "VLC", "vlc.exe")), "/Applications/VLC.app/Contents/MacOS/VLC"]) ?? onPath("vlc"),
    mpv: first(pf.map((d) => join(d, "mpv", "mpv.exe"))) ?? onPath("mpv"),
  };
  return Object.fromEntries(Object.entries(found).filter(([, p]) => p));
}

/** Opens [url] in [player]; true once it has started. The provider's User-Agent and Referer go along, as on Android. */
function openInPlayer(player, url, title, headers = {}) {
  const path = findPlayers()[player];
  if (!path) return Promise.resolve(false);
  const ua = headers["User-Agent"];
  const ref = headers.Referer;
  const args = player === "vlc"
    ? [url, `--meta-title=${title}`, ...(ua ? [`--http-user-agent=${ua}`] : []), ...(ref ? [`--http-referrer=${ref}`] : [])]
    : [url, `--force-media-title=${title}`, ...(ua ? [`--user-agent=${ua}`] : []), ...(ref ? [`--referrer=${ref}`] : [])];
  return new Promise((resolve) => {
    const child = spawn(path, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once("spawn", () => { child.unref(); resolve(true); });
    child.once("error", () => resolve(false));
  });
}

/** Where recordings go: Videos/SkMate IPTV. */
const recordingsFolder = () => join(app.getPath("videos"), "SkMate IPTV");
const recordings = new Map();

function start() {
  ipcMain.handle("companion:start", async (_e, { mode, strings, lang, backup }) => {
    if (companionServer) await companionServer.close();
    companionServer = await companion.startCompanion({
      mode, strings, lang, backup,
      onPayload: (p) => toPage("companion:event", { kind: "payload", payload: p }),
      // Only a backup of this app is taken in; anything else is refused to the sender, not shown here.
      onBackup: (text) => {
        try { if (JSON.parse(text).app !== "skmate-web") return false; } catch { return false; }
        toPage("companion:event", { kind: "backup", text });
        return true;
      },
      onLocked: () => { companionServer = null; toPage("companion:event", { kind: "locked" }); },
    });
    return { urls: companionServer.urls, pin: companionServer.pin };
  });
  ipcMain.handle("companion:stop", async () => { const s = companionServer; companionServer = null; if (s) await s.close(); return true; });
  ipcMain.handle("sync:request", (_e, { address, pin, method, body }) => companion.syncRequest(address, pin, method, body));
  // `stalker:<portal>#mac=<MAC>` (a portal as the page saves it) → the address of its M3U on the local server.
  // Started at once: a channel of a saved list may be opened before the list is fetched again.
  stalkerServer = stalker.startServer({ port: STALKER_PORT, onStreamHost: (h) => stalkerHosts.add(h) });
  stalkerServer.catch((e) => console.warn("stalker server failed:", e && e.message));
  ipcMain.handle("stalker:playlist", async (_e, source) => {
    if (!stalker.parseSource(source)) return null;
    const { base, sourceKey } = await stalkerServer;
    return `${base}/s/${sourceKey(source)}/playlist.m3u`;
  });
  ipcMain.handle("players:list", () => Object.keys(findPlayers()));
  ipcMain.handle("players:open", (_e, { player, url, title, headers }) => openInPlayer(player, url, title, headers));
  ipcMain.handle("rec:start", (_e, { id, url, title, headers, stopAtMs }) => {
    if (recordings.has(id)) return true;
    const job = record({
      url, title, headers, stopAtMs, folder: recordingsFolder(),
      onUpdate: (u) => {
        if (u.state !== "recording") recordings.delete(id);
        if (win && !win.isDestroyed()) win.webContents.send("rec:update", { id, ...u });
      },
    });
    recordings.set(id, job);
    return true;
  });
  ipcMain.handle("rec:stop", async (_e, id) => { await recordings.get(id)?.stop(); return true; });
  ipcMain.handle("rec:folder", () => { shell.openPath(recordingsFolder()); return true; });
  ipcMain.handle("rec:reveal", (_e, path) => { if (path) shell.showItemInFolder(path); return true; });
  ipcMain.on("full-screen:toggle", () => { if (win) win.setFullScreen(!win.isFullScreen()); });
  ipcMain.handle("full-screen:get", () => Boolean(win && win.isFullScreen()));
  openToProviders();
  createWindow();
  setUpUpdates();
}
