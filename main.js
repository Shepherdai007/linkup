const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  // ✅ THIS FIXES WHITE SCREEN
  win.loadFile('index.html');

  // 🔥 OPEN DEVTOOLS (to see real error)
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);