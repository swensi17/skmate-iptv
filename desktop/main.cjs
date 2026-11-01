// SkMate IPTV for Windows: the web version of the player (../web, the same build as on LG and Samsung) in its own
// window, with an installer and updates from this repository's GitHub releases.
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { autoUpdater } = require("electron-updater");

const SMOKE = process.env.SKMATE_SMOKE === "1"; // a check run: load the page, report, quit
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 5_000;
const STAGE_W = 1920; // the page is drawn for a 1920×1080 TV screen
const STAGE_H = 1080;

let win = null;

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
    icon: join(__dirname, "build", "icon.ico"),
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

function start() {
  ipcMain.on("full-screen:toggle", () => { if (win) win.setFullScreen(!win.isFullScreen()); });
  ipcMain.handle("full-screen:get", () => Boolean(win && win.isFullScreen()));
  openToProviders();
  createWindow();
  setUpUpdates();
}
