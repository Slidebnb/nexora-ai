import type { AppInfo, Provider, SecretStatus } from '../shared/ipc-contract'

export interface NexoraApi {
  getAppInfo: () => Promise<AppInfo>
  getSecretStatus: () => Promise<SecretStatus>
  setSecret: (provider: Provider, key: string) => Promise<SecretStatus>
  clearSecret: (provider: Provider) => Promise<SecretStatus>
}

declare global {
  interface Window {
    nexora: NexoraApi
  }
}
