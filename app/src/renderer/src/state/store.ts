import { create } from 'zustand'
import { NexoraEventSchema, type NexoraEvent } from '@shared/events'
import type { PickedFolder } from '@shared/ipc-contract'
import { applyEvent, initialState, type NexoraState } from './runReducer'

export type Screen = 'dashboard' | 'agents' | 'automations' | 'activity' | 'files' | 'settings'

export const SCREEN_LABEL: Record<Screen, string> = {
  dashboard: 'Dashboard',
  agents: 'Agenten',
  automations: 'Automationen',
  activity: 'Aktivitäten',
  files: 'Dateien',
  settings: 'Einstellungen'
}

export interface WorkerConnection {
  state: 'disconnected' | 'starting' | 'connected' | 'error'
  message?: string
}

export interface NexoraStore {
  data: NexoraState
  demoMode: boolean
  screen: Screen
  rightPanelOpen: boolean
  sidebarCollapsed: boolean
  worker: WorkerConnection
  /** Im nativen Dialog gewählter Ordner (bleibt beim Wechsel der Bereiche erhalten). */
  pickedFolder: PickedFolder | null
  /** Nimmt ein Event an. Demo-Events werden nur im Demo-Modus akzeptiert. */
  ingest: (event: unknown) => boolean
  setDemoMode: (on: boolean) => void
  setScreen: (screen: Screen) => void
  toggleRightPanel: () => void
  toggleSidebar: () => void
  setWorker: (worker: WorkerConnection) => void
  setPickedFolder: (folder: PickedFolder | null) => void
}

/** Baut den Zustand nur aus Live-Events neu auf (Demo-Daten verschwinden vollständig). */
function withoutDemo(state: NexoraState): NexoraState {
  return state.log.filter((e) => e.source === 'live').reduce(applyEvent, initialState)
}

export const useNexora = create<NexoraStore>((set, get) => ({
  data: initialState,
  demoMode: false,
  screen: 'dashboard',
  rightPanelOpen: true,
  sidebarCollapsed: true,
  worker: { state: 'disconnected' },
  pickedFolder: null,
  ingest: (raw) => {
    const parsed = NexoraEventSchema.safeParse(raw)
    if (!parsed.success) return false
    const event: NexoraEvent = parsed.data
    if (event.source === 'demo' && !get().demoMode) return false
    set((s) => ({ data: applyEvent(s.data, event) }))
    return true
  },
  setDemoMode: (on) =>
    set((s) => (on ? { demoMode: true } : { demoMode: false, data: withoutDemo(s.data) })),
  setScreen: (screen) => set({ screen }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setWorker: (worker) => set({ worker }),
  setPickedFolder: (pickedFolder) => set({ pickedFolder })
}))
