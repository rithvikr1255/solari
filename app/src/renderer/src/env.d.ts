interface Window {
  api: {
    saveFile(filePath: string, content: string): Promise<void>
    openFile(filePath: string): Promise<string>
    checkSpelling(words: string[]): boolean[]
    getLocketPath(): Promise<string>
    openFolder(): Promise<string | null>
    listFolder(folderPath: string): Promise<string[]>
    readNote(folderPath: string, fileName: string): Promise<string>
    createNote(folderPath: string, fileName: string): Promise<string>
    deleteNote(folderPath: string, fileName: string): Promise<void>
    confirm(message: string): Promise<boolean>
    onLocketHotkey(cb: (action: string) => void): () => void
  }
}
