import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { NexoraApi } from './api'

function subscribe<T>(channel: 'worker:event' | 'worker:status' | 'chat:delta', cb: (payload: T) => void): () => void {
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
  pauseTask: (taskId) => ipcRenderer.invoke('tasks:pause', { taskId }),
  resumeTask: (taskId) => ipcRenderer.invoke('tasks:resume', { taskId }),
  respondApproval: (approvalId, decision) => ipcRenderer.invoke('approvals:respond', { approvalId, decision }),
  revealArtifact: (artifactId) => ipcRenderer.invoke('files:reveal', { artifactId }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  createPracticeFolder: () => ipcRenderer.invoke('onboarding:practiceFolder'),
  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('license:activate', { licenseKey }),
  clearLicense: () => ipcRenderer.invoke('license:clear'),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  createTemplate: (runId, name) => ipcRenderer.invoke('templates:create', { runId, name }),
  runTemplate: (req) => ipcRenderer.invoke('templates:run', req),
  scheduleTemplate: (templateId, schedule) => ipcRenderer.invoke('templates:schedule', { templateId, schedule }),
  deleteTemplate: (templateId) => ipcRenderer.invoke('templates:delete', { templateId }),
  getSystemStatus: () => ipcRenderer.invoke('system:status'),
  testAiConnection: (provider) => ipcRenderer.invoke('ai:test', { provider }),
  listConnectors: () => ipcRenderer.invoke('connectors:list'),
  addConnector: (name, url, token) => ipcRenderer.invoke('connectors:add', { name, url, token }),
  removeConnector: (id) => ipcRenderer.invoke('connectors:remove', { id }),
  testConnector: (id) => ipcRenderer.invoke('connectors:test', { id }),
  connectorTools: (id) => ipcRenderer.invoke('connectors:tools', { id }),
  desktopWindows: () => ipcRenderer.invoke('desktop:windows'),
  desktopElements: (window) => ipcRenderer.invoke('desktop:elements', { window }),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),
  getEmailAccount: () => ipcRenderer.invoke('email:get'),
  setEmailAccount: (config) => ipcRenderer.invoke('email:set', config),
  clearEmailAccount: () => ipcRenderer.invoke('email:clear'),
  testEmailAccount: () => ipcRenderer.invoke('email:test'),
  getChatProvider: () => ipcRenderer.invoke('chat:provider'),
  sendChat: (id, messages) => ipcRenderer.invoke('chat:send', { id, messages }),
  cancelChat: (id) => ipcRenderer.invoke('chat:cancel', { id }),
  onChatDelta: (cb) => subscribe('chat:delta', cb),
  onWorkerEvent: (cb) => subscribe('worker:event', cb),
  onWorkerStatus: (cb) => subscribe('worker:status', cb)
}

contextBridge.exposeInMainWorld('nexora', api)
