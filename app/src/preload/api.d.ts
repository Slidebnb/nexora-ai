import type { ApprovalDecision, NexoraEvent } from '../shared/events'
import type { ChatDelta, ChatMessage, Provider as ChatProvider } from '../shared/ipc-contract'
import type { AiTestResult, AppInfo, Connector, ConnectorTest, ConnectorTool, DesktopElement, DesktopWindow, AppSettings, CreateTask, LicenseStatus, PickedFile, PickedFolder, Provider, Schedule, SecretStatus, SmtpConfig, SmtpStatus, SystemStatus, Template, WorkerStatus } from '../shared/ipc-contract'

export interface NexoraApi {
  getAppInfo: () => Promise<AppInfo>
  getSecretStatus: () => Promise<SecretStatus>
  setSecret: (provider: Provider, key: string) => Promise<SecretStatus>
  clearSecret: (provider: Provider) => Promise<SecretStatus>
  getWorkerStatus: () => Promise<WorkerStatus>
  getWorkerHistory: () => Promise<NexoraEvent[]>
  pickFolder: () => Promise<PickedFolder | null>
  pickFiles: (kind: 'pdf') => Promise<PickedFile[]>
  createTask: (req: CreateTask) => Promise<{ taskId: string; runId: string }>
  cancelTask: (taskId: string) => Promise<{ ok: boolean }>
  pauseTask: (taskId: string) => Promise<{ ok: boolean }>
  resumeTask: (taskId: string) => Promise<{ ok: boolean }>
  respondApproval: (approvalId: string, decision: ApprovalDecision) => Promise<{ ok: boolean }>
  revealArtifact: (artifactId: string) => Promise<{ ok: boolean }>
  getSettings: () => Promise<AppSettings>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  createPracticeFolder: () => Promise<PickedFolder>
  getLicenseStatus: () => Promise<LicenseStatus>
  activateLicense: (licenseKey: string) => Promise<LicenseStatus>
  clearLicense: () => Promise<LicenseStatus>
  listTemplates: () => Promise<Template[]>
  createTemplate: (runId: string, name: string) => Promise<Template>
  runTemplate: (req: { templateId: string; folderId?: string; fileIds?: string[]; outFolderId?: string }) => Promise<{ taskId: string; runId: string }>
  scheduleTemplate: (templateId: string, schedule: Schedule | null) => Promise<Template>
  deleteTemplate: (templateId: string) => Promise<{ ok: boolean }>
  getSystemStatus: () => Promise<SystemStatus>
  testAiConnection: (provider: Provider) => Promise<AiTestResult>
  listConnectors: () => Promise<Connector[]>
  addConnector: (name: string, url: string, token?: string) => Promise<Connector>
  removeConnector: (id: string) => Promise<{ ok: boolean }>
  testConnector: (id: string) => Promise<ConnectorTest>
  connectorTools: (id: string) => Promise<ConnectorTool[]>
  desktopWindows: () => Promise<DesktopWindow[]>
  desktopElements: (window: string) => Promise<DesktopElement[]>
  openExternal: (url: string) => Promise<{ ok: boolean }>
  getEmailAccount: () => Promise<SmtpStatus>
  setEmailAccount: (config: SmtpConfig) => Promise<SmtpStatus>
  clearEmailAccount: () => Promise<SmtpStatus>
  testEmailAccount: () => Promise<{ ok: boolean; message: string }>
  getChatProvider: () => Promise<{ provider: ChatProvider | null; model: string | null }>
  sendChat: (id: string, messages: ChatMessage[]) => Promise<{ text: string; model: string; provider: ChatProvider }>
  cancelChat: (id: string) => Promise<{ ok: boolean }>
  exportAudit: () => Promise<{ path: string; runs: number } | null>
  speakCloud: (text: string) => Promise<{ audioBase64: string; mime: string }>
  transcribeCloud: (audioBase64: string, mime: string) => Promise<{ text: string }>
  onChatDelta: (cb: (d: ChatDelta) => void) => () => void
  onWorkerEvent: (cb: (event: unknown) => void) => () => void
  onWorkerStatus: (cb: (status: WorkerStatus) => void) => () => void
}

declare global {
  interface Window {
    nexora: NexoraApi
  }
}
