// What the page may ask of the Windows app: full screen, an external player, recording, Stalker portals. The page stays sandboxed,
// with no Node: each call is one named request the main process answers.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("skmateDesktop", {
  toggleFullScreen: () => ipcRenderer.send("full-screen:toggle"),
  isFullScreen: () => ipcRenderer.invoke("full-screen:get"),
  onFullScreen: (listener) => {
    const on = (_e, value) => listener(value);
    ipcRenderer.on("full-screen", on);
    return () => ipcRenderer.removeListener("full-screen", on);
  },
  players: () => ipcRenderer.invoke("players:list"),
  openInPlayer: (player, url, title, headers) => ipcRenderer.invoke("players:open", { player, url, title, headers }),
  startRecording: (id, url, title, headers, stopAtMs) => ipcRenderer.invoke("rec:start", { id, url, title, headers, stopAtMs }),
  stopRecording: (id) => ipcRenderer.invoke("rec:stop", id),
  onRecording: (listener) => {
    const on = (_e, value) => listener(value);
    ipcRenderer.on("rec:update", on);
    return () => ipcRenderer.removeListener("rec:update", on);
  },
  openRecordings: () => ipcRenderer.invoke("rec:folder"),
  revealRecording: (path) => ipcRenderer.invoke("rec:reveal", path),
  stalkerPlaylist: (source) => ipcRenderer.invoke("stalker:playlist", source),
});
