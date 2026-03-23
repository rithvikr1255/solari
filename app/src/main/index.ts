import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs/promises'
import { readFileSync } from 'fs'
import nspell from 'nspell'

let spell: ReturnType<typeof nspell> | null = null

function createWindow(): void {
  const win = new BrowserWindow({
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

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('save-file', async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8')
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
  // Load dictionary in background — returns true for all words until ready
  const dictDir = resolve(__dirname, '../../node_modules/dictionary-en')
  try {
    const aff = readFileSync(join(dictDir, 'index.aff'))
    const dic = readFileSync(join(dictDir, 'index.dic'))
    spell = nspell(aff, dic)
  } catch {
    // Spell check disabled; autocorrect still fires on paragraph boundaries
  }

  electronApp.setAppUserModelId('com.solari')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
