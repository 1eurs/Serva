const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('station', {
  call: (name, arg) => ipcRenderer.invoke('station', name, arg),
  on: (channel, cb) => {
    if (channel === 'state' || channel === 'progress') ipcRenderer.on(channel, (_e, payload) => cb(payload));
  },
});
