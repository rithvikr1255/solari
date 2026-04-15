import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path, { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs/promises'
import { readFileSync } from 'fs'
import nspell from 'nspell'

let spell: ReturnType<typeof nspell> | null = null
let mainWin: BrowserWindow | null = null

function getLocketDir(): string {
  return path.join(app.getPath('documents'), 'Solari Locket')
}

function setupMenu(): void {
  const send = (action: string) => mainWin?.webContents.send('locket-hotkey', action)

  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => send('new-note') },
        { label: 'Save Note', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Search Notes', accelerator: 'CmdOrCtrl+O', click: () => send('search') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWin.on('ready-to-show', () => mainWin?.show())
  mainWin.on('closed', () => { mainWin = null })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('confirm-dialog', async (_event, message: string) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Cancel', 'Delete'],
    defaultId: 0,
    cancelId: 0,
    message,
  })
  return result.response === 1
})

ipcMain.handle('get-locket-path', async () => {
  const dir = getLocketDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
})

ipcMain.handle('save-file', async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8')
})

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('list-folder', async (_event, folderPath: string) => {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort()
})

ipcMain.handle('read-note', async (_event, folderPath: string, fileName: string) => {
  return fs.readFile(path.join(folderPath, fileName), 'utf-8')
})

ipcMain.handle('create-note', async (_event, folderPath: string, fileName: string) => {
  const filePath = path.join(folderPath, fileName)
  await fs.writeFile(filePath, '', { flag: 'wx' })
  return fileName
})

ipcMain.handle('delete-note', async (_event, folderPath: string, fileName: string) => {
  await fs.unlink(path.join(folderPath, fileName))
})

ipcMain.handle('open-file', async (_event, filePath: string) => {
  return fs.readFile(filePath, 'utf-8')
})

// Synchronous IPC so the renderer can use it as a gate without async overhead
ipcMain.on('spell-check', (event, words: string[]) => {
  if (!spell) {
    event.returnValue = words.map(() => true)
    return
  }
  event.returnValue = (words as string[]).map((w) => spell!.correct(w.toLowerCase()))
})

app.whenReady().then(() => {
  const dictDir = resolve(__dirname, '../../node_modules/dictionary-en')
  try {
    const aff = readFileSync(join(dictDir, 'index.aff'))
    const dic = readFileSync(join(dictDir, 'index.dic'))
    spell = nspell(aff, dic)
  } catch {
  }

  electronApp.setAppUserModelId('com.solari')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  setupMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
