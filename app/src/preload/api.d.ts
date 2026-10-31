import type { AppInfo } from '../shared/ipc-contract'

export interface NexoraApi {
  getAppInfo: () => Promise<AppInfo>
}

declare global {
  interface Window {
    nexora: NexoraApi
  }
}
