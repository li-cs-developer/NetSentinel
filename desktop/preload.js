'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('netsentinel', {
    isRunning:  () => ipcRenderer.invoke('netsentinel:isRunning'),
    getStats:   () => ipcRenderer.invoke('netsentinel:getStats'),
    health:     () => ipcRenderer.invoke('netsentinel:health'),
    startCapture: (iface) => ipcRenderer.invoke('netsentinel:startCapture', iface),
    stopCapture:  ()       => ipcRenderer.invoke('netsentinel:stopCapture'),

    onSnapshot: (cb) => {
        if (typeof cb !== 'function') {
            throw new TypeError('onSnapshot expects a function');
        }
        const listener = (_event, payload) => {
            try { cb(payload); } catch (err) {
                console.error('[preload] snapshot handler threw:', err);
            }
        };
        ipcRenderer.on('netsentinel:snapshot', listener);
        return () => ipcRenderer.removeListener('netsentinel:snapshot', listener);
    },
});
