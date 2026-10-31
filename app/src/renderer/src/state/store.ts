import { create } from 'zustand'
import { NexoraEventSchema, type NexoraEvent } from '@shared/events'
import type { AppSettings, PickedFile, PickedFolder } from '@shared/ipc-contract'
import { applyEvent, initialState, type NexoraState } from './runReducer'

export type Screen = 'dashboard' | 'agents' | 'automations' | 'activity' | 'files' | 'settings'

function readExpert(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('nexora.expert') === '1'
  } catch {
    return false
  }
}

export const SCREEN_LABEL: Record<Screen, string> = {
  dashboard: 'Start',
  agents: 'Agenten',
  automations: 'Automationen',
  activity: 'Aktivitäten',
  files: 'Dateien',
  settings: 'Einstellungen'
}

export interface ComposerDraft {
  question: string
  urls: string
  briefing: string
  recipients: string
  subject: string
  files: PickedFile[]
  outFolder: PickedFolder | null
  useCloudAi: boolean
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
  /** Eingaben des Aufgabenfelds je Workflow (bleiben beim Bereichswechsel erhalten). */
  composer: ComposerDraft
  /** Technische Ansicht (Ereignisprotokoll, Event-Stream, Kennzahlen). Standard: aus. */
  expertMode: boolean
  /** Geöffneter Aufgaben-Assistent (Vorlagen-ID aus data/workflows) */
  wizard: string | null
  /** App-Einstellungen aus dem Main-Prozess (null bis geladen) */
  settings: AppSettings | null
  /** Nimmt ein Event an. Demo-Events werden nur im Demo-Modus akzeptiert. */
  ingest: (event: unknown) => boolean
  setDemoMode: (on: boolean) => void
  setScreen: (screen: Screen) => void
  toggleRightPanel: () => void
  toggleSidebar: () => void
  setWorker: (worker: WorkerConnection) => void
  setPickedFolder: (folder: PickedFolder | null) => void
  setComposer: (patch: Partial<ComposerDraft>) => void
  setExpertMode: (on: boolean) => void
  setWizard: (id: string | null) => void
  setSettings: (settings: AppSettings) => void
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>
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
  expertMode: readExpert(),
  wizard: null,
  settings: null,
  composer: { question: '', urls: '', briefing: '', recipients: '', subject: '', files: [], outFolder: null, useCloudAi: false },
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
  setPickedFolder: (pickedFolder) => set({ pickedFolder }),
  setComposer: (patch) => set((s) => ({ composer: { ...s.composer, ...patch } })),
  setExpertMode: (on) => {
    try {
      localStorage.setItem('nexora.expert', on ? '1' : '0')
    } catch {
      /* ohne Speicher: nur für diese Sitzung */
    }
    set({ expertMode: on })
  },
  setWizard: (wizard) => set({ wizard }),
  setSettings: (settings) => set({ settings }),
  saveSettings: async (patch) => {
    set({ settings: await window.nexora.updateSettings(patch) })
  }
}))
