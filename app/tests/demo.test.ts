import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoPlayer } from '../src/renderer/src/demo/demoPlayer'
import { DEMO_SCENARIOS } from '../src/renderer/src/demo/scenarios'
import { useNexora } from '../src/renderer/src/state/store'
import { selectPendingApprovals } from '../src/renderer/src/state/selectors'
import { ev, resetSeq } from './helpers'

const ordner = DEMO_SCENARIOS.find((s) => s.id === 'ordner')!
const recherche = DEMO_SCENARIOS.find((s) => s.id === 'recherche')!

function setup() {
  useNexora.setState({ data: useNexora.getInitialState().data, demoMode: true })
  const player = new DemoPlayer((e) => useNexora.getState().ingest(e))
  return { player, state: () => useNexora.getState().data }
}

beforeEach(() => {
  vi.useFakeTimers()
  resetSeq()
})
afterEach(() => vi.useRealTimers())

describe('DemoPlayer', () => {
  it('markiert jedes Event als demo', () => {
    const { player, state } = setup()
    player.start(recherche)
    vi.runAllTimers()
    expect(state().log.length).toBeGreaterThan(5)
    expect(state().log.every((e) => e.source === 'demo')).toBe(true)
  })

  it('wartet bei einer Freigabe, bis der Nutzer entscheidet', () => {
    const { player, state } = setup()
    const runId = player.start(ordner)
    vi.runAllTimers()
    expect(state().runs[runId]!.status).toBe('waiting_approval')
    const [approval] = selectPendingApprovals(state())
    expect(approval?.action).toBe('Dateien verschieben')

    player.respondApproval(approval!.id, 'allow')
    vi.runAllTimers()
    expect(state().runs[runId]!.status).toBe('succeeded')
    expect(state().runs[runId]!.verification).toMatch(/DEMO/)
    expect(state().artifacts.map((a) => a.name)).toContain('Sortierprotokoll.csv')
  })

  it('führt nach Ablehnung den Schritt nicht aus und bricht ab', () => {
    const { player, state } = setup()
    const runId = player.start(ordner)
    vi.runAllTimers()
    const [approval] = selectPendingApprovals(state())
    player.respondApproval(approval!.id, 'deny')
    vi.runAllTimers()
    const run = state().runs[runId]!
    expect(run.status).toBe('cancelled')
    expect(run.endedAt).toBeDefined()
    expect(run.protocolErrors).toEqual([])
    expect(run.steps.find((s) => s.id === 'move')!.status).toBe('pending')
    expect(state().artifacts).toHaveLength(0)
  })

  it('zeigt einen simulierten Schrittfehler, ohne den ganzen Lauf als Erfolg zu verschleiern', () => {
    const { player, state } = setup()
    const runId = player.start(recherche)
    vi.runAllTimers()
    const run = state().runs[runId]!
    expect(run.steps.find((s) => s.id === 'w3')!.status).toBe('failed')
    expect(run.stepsDone).toBe(4)
    expect(run.stepsTotal).toBe(5)
    expect(run.verification).toMatch(/1 Quelle fehlgeschlagen/)
  })

  it('stoppt einen laufenden Vorgang', () => {
    const { player, state } = setup()
    const runId = player.start(recherche)
    vi.advanceTimersByTime(1000)
    player.cancel(runId)
    vi.runAllTimers()
    expect(state().runs[runId]!.status).toBe('cancelled')
    expect(player.activeRunIds).toHaveLength(0)
  })

  it('stoppt einen Vorgang, der auf Freigabe wartet, ohne Protokollfehler', () => {
    const { player, state } = setup()
    const runId = player.start(ordner)
    vi.runAllTimers()
    player.cancel(runId)
    const run = state().runs[runId]!
    expect(run.status).toBe('cancelled')
    expect(run.protocolErrors).toEqual([])
    expect(selectPendingApprovals(state())).toHaveLength(0)
  })

  it.each(DEMO_SCENARIOS.map((s) => [s.id, s] as const))('Szenario %s erzeugt keine Protokollfehler', (_id, scenario) => {
    const { player, state } = setup()
    const runId = player.start(scenario)
    vi.runAllTimers()
    for (const a of selectPendingApprovals(state())) player.respondApproval(a.id, 'allow')
    vi.runAllTimers()
    expect(state().runs[runId]!.protocolErrors).toEqual([])
    expect(state().runs[runId]!.status).toBe('succeeded')
  })
})

describe('Store', () => {
  it('verwirft Demo-Events, wenn der Demo-Modus aus ist', () => {
    useNexora.setState({ data: useNexora.getInitialState().data, demoMode: false })
    const accepted = useNexora.getState().ingest(ev('run_created', 'queued', { title: 'x' }, { source: 'demo' }))
    expect(accepted).toBe(false)
    expect(useNexora.getState().data.runOrder).toHaveLength(0)
  })

  it('verwirft ungültige Events', () => {
    expect(useNexora.getState().ingest({ type: 'run_created' })).toBe(false)
  })

  it('entfernt beim Verlassen des Demo-Modus alle Demo-Daten, Live-Daten bleiben', () => {
    useNexora.setState({ data: useNexora.getInitialState().data, demoMode: true })
    const { ingest } = useNexora.getState()
    ingest(ev('run_created', 'queued', { title: 'live' }, { runId: 'live-1' }))
    ingest(ev('run_created', 'queued', { title: 'demo' }, { runId: 'demo-1', source: 'demo' }))
    useNexora.getState().setDemoMode(false)
    expect(useNexora.getState().data.runOrder).toEqual(['live-1'])
  })
})
