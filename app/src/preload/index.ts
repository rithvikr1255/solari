import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('save-file', filePath, content),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  checkSpelling: (words: string[]): boolean[] => ipcRenderer.sendSync('spell-check', words),
  getLocketPath: (): Promise<string> => ipcRenderer.invoke('get-locket-path'),
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('open-folder'),
  listFolder: (folderPath: string): Promise<string[]> =>
    ipcRenderer.invoke('list-folder', folderPath),
  readNote: (folderPath: string, fileName: string): Promise<string> =>
    ipcRenderer.invoke('read-note', folderPath, fileName),
  createNote: (folderPath: string, fileName: string): Promise<string> =>
    ipcRenderer.invoke('create-note', folderPath, fileName),
  deleteNote: (folderPath: string, fileName: string): Promise<void> =>
    ipcRenderer.invoke('delete-note', folderPath, fileName),
  confirm: (message: string): Promise<boolean> => ipcRenderer.invoke('confirm-dialog', message),
  onLocketHotkey: (cb: (action: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => cb(action)
    ipcRenderer.on('locket-hotkey', handler)
    return () => ipcRenderer.removeListener('locket-hotkey', handler)
  },
})
