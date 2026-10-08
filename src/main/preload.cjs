const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('cloud', Object.freeze({
  call: (method, args = {}) => ipcRenderer.invoke('cloud:call', method, args),
  desktopLyrics: enabled => ipcRenderer.invoke('cloud:lyrics', enabled),
  lyricsSnapshot: value => ipcRenderer.send('cloud:lyrics-snapshot', value),
  onLyricsState: callback => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('cloud:lyrics-state', listener)
    return () => ipcRenderer.removeListener('cloud:lyrics-state', listener)
  },
  onLyricsError: callback => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('cloud:lyrics-error', listener)
    return () => ipcRenderer.removeListener('cloud:lyrics-error', listener)
  },
  window: action => ipcRenderer.invoke('cloud:window', action)
}))
