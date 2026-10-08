const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktopLyrics', Object.freeze({
  get: () => ipcRenderer.invoke('lyrics:get'),
  action: action => ipcRenderer.invoke('lyrics:action', action),
  drag: (phase,point) => ipcRenderer.invoke('lyrics:drag', phase, point),
  subscribe: callback => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('lyrics:update', listener)
    return () => ipcRenderer.removeListener('lyrics:update', listener)
  }
}))
