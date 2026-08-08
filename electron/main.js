'use strict';

const path = require('path');
const { app, BrowserWindow, dialog, shell } = require('electron');

const APP_NAME = 'Coffee Youtube DL';
const APP_PORT = 4317;
let mainWindow;
let localServer;
let serverController;
const startHidden = process.env.COFFEE_YTDL_START_HIDDEN === '1';

app.setName(APP_NAME);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  console.error('Coffee Youtube DL is already running.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const appRoot = path.resolve(__dirname, '..');
    const resourcesRoot = app.isPackaged ? process.resourcesPath : appRoot;

    process.env.COFFEE_YTDL_PORT = String(APP_PORT);
    process.env.COFFEE_YTDL_TOOLS_ROOT = resourcesRoot;
    process.env.COFFEE_YTDL_DOWNLOAD_ROOT = path.join(
      app.getPath('downloads'),
      APP_NAME
    );

    try {
      const serverModule = require(path.join(appRoot, 'server.js'));
      serverController = serverModule;
      localServer = await serverModule.startServer();

      mainWindow = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 860,
        minHeight: 620,
        show: false,
        backgroundColor: '#111827',
        title: APP_NAME,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
          preload: path.join(__dirname, 'preload.js'),
        },
      });

      mainWindow.removeMenu();

      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) {
          void shell.openExternal(url);
        }
        return { action: 'deny' };
      });

      mainWindow.once('ready-to-show', () => {
        if (!startHidden) mainWindow.show();
      });

      mainWindow.on('closed', () => {
        mainWindow = null;
      });

      await mainWindow.loadURL('http://127.0.0.1:' + APP_PORT);
    } catch (error) {
      console.error(error.stack || error.message);
      dialog.showErrorBox(
        APP_NAME,
        'アプリを起動できませんでした。\n\n' + (error.stack || error.message)
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (serverController) {
      serverController.shutdown();
    } else if (localServer?.listening) {
      localServer.close();
    }
  });
}