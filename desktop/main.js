'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const STATS_INTERVAL_MS = 500;

const isPackaged = app.isPackaged;

const addonPath = isPackaged
    ? path.join(process.resourcesPath, 'addon', 'netsentinel_addon_electron.node')
    : path.join(__dirname, '..', 'build', 'Release', 'netsentinel_addon_electron.node');

const dashboardIndexPath = isPackaged
    ? path.join(process.resourcesPath, 'dashboard', 'index.html')
    : path.join(__dirname, '..', 'dashboard', 'dist', 'index.html');

if (!fs.existsSync(addonPath)) {
    console.error(
        `[desktop] native addon not found at:\n  ${addonPath}\n\n` +
        `Run from the desktop/ directory:\n` +
        `  npm run rebuild-addon\n`
    );
    app.quit();
    process.exit(1);
}

if (!fs.existsSync(dashboardIndexPath)) {
    console.error(
        `[desktop] dashboard build not found at:\n  ${dashboardIndexPath}\n\n` +
        `Run from the repo root:\n` +
        `  cd dashboard && npm run build\n`
    );
    app.quit();
    process.exit(1);
}

const addon = require(addonPath);

let prevSnapshot = null;
let prevTime = 0;
let pumpHandle = null;

function pumpOnce() {
    let snap;
    try {
        snap = addon.getStats();
    } catch (err) {
        console.error('[desktop] getStats failed:', err);
        return;
    }

    const now = Date.now();
    let pps = 0;
    let bps = 0;
    if (prevSnapshot) {
        const dt = Math.max((now - prevTime) / 1000, 0.001);
        const dp = snap.total_packets - prevSnapshot.total_packets;
        const db = snap.total_bytes   - prevSnapshot.total_bytes;
        if (dp >= 0) pps = dp / dt;
        if (db >= 0) bps = db / dt;
    }
    prevSnapshot = snap;
    prevTime = now;

    const payload = { ...snap, pps, bps, t: now };

    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send('netsentinel:snapshot', payload);
        }
    }
}

function startPump() {
    if (pumpHandle) return;
    pumpHandle = setInterval(pumpOnce, STATS_INTERVAL_MS);
    console.log(`[desktop] stats pump started (every ${STATS_INTERVAL_MS}ms)`);
}

function stopPump() {
    if (!pumpHandle) return;
    clearInterval(pumpHandle);
    pumpHandle = null;
    prevSnapshot = null;
    prevTime = 0;
    console.log('[desktop] stats pump stopped');
}

ipcMain.handle('netsentinel:isRunning', () => addon.isRunning());
ipcMain.handle('netsentinel:getStats', () => addon.getStats());

ipcMain.handle('netsentinel:startCapture', async (_event, iface) => {
    if (addon.isRunning()) {
        throw new Error('capture already running');
    }
    const name = await addon.startCapture(iface || null);
    startPump();
    return name;
});

ipcMain.handle('netsentinel:stopCapture', async () => {
    stopPump();
    await addon.stopCapture();
});

ipcMain.handle('netsentinel:health', () => ({
    status: 'ok',
    uptime_s: Math.round(process.uptime()),
    capture_running: addon.isRunning(),
    node_version: process.versions.node,
}));

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0b1220',
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.loadFile(dashboardIndexPath, { query: { mode: 'desktop' } });

    if (process.env.ELECTRON_IS_DEV === '1') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

app.whenReady().then(() => {
    console.log('[desktop] addon loaded from', addonPath);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
    if (!addon.isRunning()) return;

    event.preventDefault();
    try {
        stopPump();
        await addon.stopCapture();
        console.log('[desktop] capture stopped cleanly');
    } catch (err) {
        console.error('[desktop] shutdown error:', err);
    } finally {
        app.exit(0);
    }
});
