const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cornerpet', Object.freeze({
  getState: () => ipcRenderer.invoke('pet:state'),
  interact: () => ipcRenderer.invoke('pet:interact'),
  onState: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('pet:state', listener);
    return () => ipcRenderer.removeListener('pet:state', listener);
  },
  getConfig: () => ipcRenderer.invoke('pet:config'),
  setScale: scale => ipcRenderer.invoke('pet:scale', scale),
  resizePreview: scale => ipcRenderer.invoke('pet:resize-preview', scale),
  resizeCommit: scale => ipcRenderer.invoke('pet:resize-commit', scale),
  resizeCancel: () => ipcRenderer.invoke('pet:resize-cancel'),
  focusPet: () => ipcRenderer.send('pet:focus'),
  onResizeHint: callback => {
    const listener = () => callback();
    ipcRenderer.on('pet:resize-hint', listener);
    return () => ipcRenderer.removeListener('pet:resize-hint', listener);
  },
  previewScale: scale => ipcRenderer.invoke('pet:scale-preview', scale),
  getScaleOptions: () => ipcRenderer.invoke('pet:scale-options'),
  closeScale: () => ipcRenderer.send('pet:scale-close'),
  getView: () => ipcRenderer.invoke('pet:view'),
  setFootprint: rect => ipcRenderer.invoke('pet:footprint', rect),
  onView: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('pet:view', listener);
    return () => ipcRenderer.removeListener('pet:view', listener);
  },
  startDrag: () => ipcRenderer.invoke('pet:drag-start'),
  endDrag: () => ipcRenderer.invoke('pet:drag-end'),
  menu: () => ipcRenderer.send('pet:menu'),
  quit: () => ipcRenderer.send('pet:quit'),
}));
