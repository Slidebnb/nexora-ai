import type { ApprovalDecision, NexoraEvent } from '../shared/events'
import type { AppInfo, CreateTask, PickedFile, PickedFolder, Provider, Schedule, SecretStatus, Template, WorkerStatus } from '../shared/ipc-contract'

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
  respondApproval: (approvalId: string, decision: ApprovalDecision) => Promise<{ ok: boolean }>
  revealArtifact: (artifactId: string) => Promise<{ ok: boolean }>
  listTemplates: () => Promise<Template[]>
  createTemplate: (runId: string, name: string) => Promise<Template>
  runTemplate: (req: { templateId: string; folderId?: string; fileIds?: string[]; outFolderId?: string }) => Promise<{ taskId: string; runId: string }>
  scheduleTemplate: (templateId: string, schedule: Schedule | null) => Promise<Template>
  deleteTemplate: (templateId: string) => Promise<{ ok: boolean }>
  onWorkerEvent: (cb: (event: unknown) => void) => () => void
  onWorkerStatus: (cb: (status: WorkerStatus) => void) => () => void
}

declare global {
  interface Window {
    nexora: NexoraApi
  }
}
