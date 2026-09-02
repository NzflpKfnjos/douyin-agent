import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("publisher", {
  getState: () => ipcRenderer.invoke("publisher:state"),
  chooseImage: () => ipcRenderer.invoke("publisher:choose-image"),
  login: () => ipcRenderer.invoke("publisher:login"),
  finishLogin: () => ipcRenderer.invoke("publisher:finish-login"),
  publish: (article) => ipcRenderer.invoke("publisher:publish", article),
  onProgress: (callback) => ipcRenderer.on("publish-progress", (_event, message) => callback(message)),
});
