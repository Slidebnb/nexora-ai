import { create } from 'zustand'
import { NexoraEventSchema, type NexoraEvent } from '@shared/events'
import { applyEvent, initialState, type NexoraState } from './runReducer'

export type Screen = 'dashboard' | 'agents' | 'automations' | 'activity' | 'files' | 'settings'

export interface NexoraStore {
  data: NexoraState
  demoMode: boolean
  screen: Screen
  rightPanelOpen: boolean
  /** Nimmt ein Event an. Demo-Events werden nur im Demo-Modus akzeptiert. */
  ingest: (event: unknown) => boolean
  setDemoMode: (on: boolean) => void
  setScreen: (screen: Screen) => void
  toggleRightPanel: () => void
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
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen }))
}))
