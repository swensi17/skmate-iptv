// What the page may ask of the Windows app: only the full-screen switch. The page stays sandboxed, with no Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("skmateDesktop", {
  toggleFullScreen: () => ipcRenderer.send("full-screen:toggle"),
  isFullScreen: () => ipcRenderer.invoke("full-screen:get"),
  onFullScreen: (listener) => {
    const on = (_e, value) => listener(value);
    ipcRenderer.on("full-screen", on);
    return () => ipcRenderer.removeListener("full-screen", on);
  },
});
