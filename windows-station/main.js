// The app around the station: one setup/status window, a tray icon, and nothing that stops
// printing when the window is closed. Quitting is only in the tray menu, and it asks.
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const station = require('./station');

let win = null;
let tray = null;
let quitting = false;
let toldAboutTray = false;

function show() {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function quit() {
  if (station.collecting()) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Serva Station',
      message: 'Stop printing on this computer?',
      detail: 'Tickets will wait on Serva and nothing will print here until Serva Station is opened again.',
      buttons: ['Keep printing', 'Quit'],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return;
  }
  quitting = true;
  app.quit();
}

let menuKey = '';
function refreshTray(s) {
  tray.setToolTip(`Serva Station — ${s.status}`.slice(0, 127));
  const key = `${s.configured}/${s.paused}`;
  if (key === menuKey) return; // rebuilding on every pull would close the menu under the cursor
  menuKey = key;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Serva Station', click: show },
    { label: s.paused ? 'Resume collecting' : 'Pause collecting', enabled: s.configured, click: () => station.actions.togglePause() },
    { type: 'separator' },
    { label: 'Quit (stops printing)', click: quit },
  ]));
}

function createWindow(icon) {
  win = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'Serva Station',
    icon,
    backgroundColor: '#03120D',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('query-session-end', () => { quitting = true; }); // never hold up a Windows shutdown
  // Started with Windows: come up minimised in the taskbar, where staff can see it is running.
  win.once('ready-to-show', () => (process.argv.includes('--background') && station.collecting() ? win.minimize() : win.show()));
  win.on('close', (e) => {
    if (quitting || !station.snapshot().configured) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && process.platform === 'win32') {
      toldAboutTray = true;
      tray.displayBalloon({ iconType: 'info', title: 'Serva Station is still printing', content: 'It keeps running by the clock. Right-click the icon there to quit.' });
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('om.serva.station');
  app.on('second-instance', () => win && show());
  app.on('window-all-closed', () => {}); // NOTE: the station keeps printing with no window open
  app.on('before-quit', () => { quitting = true; });

  app.whenReady().then(() => {
    station.load();
    const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.on('click', show);
    createWindow(icon);

    ipcMain.handle('station', async (_e, name, arg) => {
      if (!Object.hasOwn(station.actions, name)) return { error: `unknown action ${name}` };
      try {
        return { value: await station.actions[name](arg) };
      } catch (e) {
        return { error: e.message };
      }
    });
    station.events.notify = (channel, payload) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
      if (channel === 'state') refreshTray(payload);
    };
    refreshTray(station.snapshot());
    station.run();
  });
}
