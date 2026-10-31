import { contextBridge, ipcRenderer } from 'electron'
import type { NexoraApi } from './api'

// Nur diese typisierten Funktionen sind im Renderer sichtbar; kein direkter ipcRenderer-Zugriff.
const api: NexoraApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo')
}

contextBridge.exposeInMainWorld('nexora', api)
