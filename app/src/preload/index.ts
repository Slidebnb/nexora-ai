import { contextBridge, ipcRenderer } from 'electron'
import type { NexoraApi } from './api'

// Nur diese typisierten Funktionen sind im Renderer sichtbar; kein direkter ipcRenderer-Zugriff.
const api: NexoraApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSecretStatus: () => ipcRenderer.invoke('secrets:status'),
  setSecret: (provider, key) => ipcRenderer.invoke('secrets:set', { provider, key }),
  clearSecret: (provider) => ipcRenderer.invoke('secrets:clear', { provider })
}

contextBridge.exposeInMainWorld('nexora', api)
