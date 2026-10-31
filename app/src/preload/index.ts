import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { NexoraApi } from './api'

function subscribe<T>(channel: 'worker:event' | 'worker:status', cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Nur diese typisierten Funktionen sind im Renderer sichtbar; kein direkter ipcRenderer-Zugriff.
const api: NexoraApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSecretStatus: () => ipcRenderer.invoke('secrets:status'),
  setSecret: (provider, key) => ipcRenderer.invoke('secrets:set', { provider, key }),
  clearSecret: (provider) => ipcRenderer.invoke('secrets:clear', { provider }),
  getWorkerStatus: () => ipcRenderer.invoke('worker:status'),
  getWorkerHistory: () => ipcRenderer.invoke('worker:history'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickFiles: (kind) => ipcRenderer.invoke('dialog:pickFiles', { kind }),
  createTask: (req) => ipcRenderer.invoke('tasks:create', req),
  cancelTask: (taskId) => ipcRenderer.invoke('tasks:cancel', { taskId }),
  respondApproval: (approvalId, decision) => ipcRenderer.invoke('approvals:respond', { approvalId, decision }),
  revealArtifact: (artifactId) => ipcRenderer.invoke('files:reveal', { artifactId }),
  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('license:activate', { licenseKey }),
  clearLicense: () => ipcRenderer.invoke('license:clear'),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  createTemplate: (runId, name) => ipcRenderer.invoke('templates:create', { runId, name }),
  runTemplate: (req) => ipcRenderer.invoke('templates:run', req),
  scheduleTemplate: (templateId, schedule) => ipcRenderer.invoke('templates:schedule', { templateId, schedule }),
  deleteTemplate: (templateId) => ipcRenderer.invoke('templates:delete', { templateId }),
  onWorkerEvent: (cb) => subscribe('worker:event', cb),
  onWorkerStatus: (cb) => subscribe('worker:status', cb)
}

contextBridge.exposeInMainWorld('nexora', api)
