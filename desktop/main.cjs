// SkMate IPTV for Windows: the web version of the player (../web, the same build as on LG and Samsung) in its own
// window, with an installer and updates from this repository's GitHub releases.
const { app, BrowserWindow, dialog, Menu, session, shell } = require("electron");
const { join } = require("node:path");
const { autoUpdater } = require("electron-updater");

const SMOKE = process.env.SKMATE_SMOKE === "1"; // a check run: load the page, report, quit
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 5_000;

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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(join(__dirname, "app", "index.html"));

  // Links the app shows (Telegram, GitHub) open in the system browser, never inside the player window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) { e.preventDefault(); shell.openExternal(url); }
  });

  // F11 and Alt+Enter: full screen, as in a video player. Esc stays the app's Back key.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11" || (input.alt && input.key === "Enter")) {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.once("ready-to-show", () => {
    if (SMOKE) return;
    win.maximize();
    win.show();
  });
  win.on("closed", () => { win = null; });

  if (SMOKE) {
    win.webContents.on("console-message", (_e, level, message) => { if (level >= 3) console.log(`[page error] ${message}`); });
    win.webContents.once("did-finish-load", async () => {
      await new Promise((r) => setTimeout(r, 2500));
      const text = await win.webContents.executeJavaScript("document.body.innerText.slice(0, 120)");
      console.log(`[smoke] loaded: ${JSON.stringify(text)}`);
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
  openToProviders();
  createWindow();
  setUpUpdates();
}
