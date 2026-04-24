'use strict';

const { app, BrowserWindow, Menu, Tray, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');

const APP_URL     = 'https://optima.sclera.com';
const DIST_INDEX  = path.join(__dirname, '../frontend/dist/index.html');
const IS_DEV      = process.env.NODE_ENV === 'development';
const USE_REMOTE  = process.env.ELECTRON_REMOTE === '1';

let mainWindow = null;
let tray       = null;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:          1280,
    height:         820,
    minWidth:       960,
    minHeight:      600,
    title:          'Optima',
    icon:           path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0e0e12',
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      contextIsolation:   true,
      nodeIntegration:    false,
      sandbox:            true,
      webSecurity:        true,
    },
    show: false,  // shown after ready-to-show to avoid flash
  });

  // Load the app — remote server URL or local bundled build
  if (IS_DEV || USE_REMOTE) {
    mainWindow.loadURL(APP_URL);
  } else {
    mainWindow.loadFile(DIST_INDEX);
  }

  // Show window once content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray on close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open DevTools in dev mode
  if (IS_DEV) mainWindow.webContents.openDevTools();
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Optima — Asset Management');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Optima',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Reload',
      click: () => mainWindow?.webContents.reload(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
  });
}

// ── App Menu ──────────────────────────────────────────────────────────────────
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => { app.isQuitting = true; app.quit(); },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            const wc = mainWindow?.webContents;
            if (wc) wc.setZoomFactor(Math.min(wc.getZoomFactor() + 0.1, 2.0));
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const wc = mainWindow?.webContents;
            if (wc) wc.setZoomFactor(Math.max(wc.getZoomFactor() - 0.1, 0.5));
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.setZoomFactor(1.0),
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        {
          label: 'Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open in Browser',
          click: () => shell.openExternal(APP_URL),
        },
        { type: 'separator' },
        {
          label: 'About Optima',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type:    'info',
              title:   'About Optima',
              message: 'Optima v7.1.2',
              detail:  'HAM/SAM Enterprise Asset Management\n© 2024 Sclera\n\nServer: ' + APP_URL,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  // macOS: add app menu at position 0
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildAppMenu();
  createTray();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  // On macOS keep running in tray; on other platforms quit
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuitting = true; });
