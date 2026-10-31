import { beforeEach, describe, expect, it } from 'vitest'
import { applyEvent, initialState, progressOf, reduceEvents } from '../src/renderer/src/state/runReducer'
import { selectAgents, selectCostSeries, selectKpis, selectPendingApprovals } from '../src/renderer/src/state/selectors'
import { ev, resetSeq } from './helpers'

beforeEach(resetSeq)

const created = () => ev('run_created', 'queued', { title: 'Ordner sortieren', agentName: 'Sortierer' })
const plan = () =>
  ev('plan_ready', 'running', { steps: [{ id: 's1', title: 'Analysieren' }, { id: 's2', title: 'Verschieben' }] })

describe('Fortschritt', () => {
  it('ist indeterminiert (null), solange kein Plan mit Schrittzahl vorliegt', () => {
    const s = reduceEvents([created(), ev('step_started', 'running', { title: 'x' }, { stepId: 'sx' })])
    expect(progressOf(s.runs['r1']!)).toBeNull()
    expect(s.runs['r1']!.stepsTotal).toBeUndefined()
  })

  it('zählt nur tatsächlich erfolgreiche Schritte', () => {
    const s = reduceEvents([
      created(),
      plan(),
      ev('step_started', 'running', {}, { stepId: 's1' }),
      ev('step_succeeded', 'running', {}, { stepId: 's1' })
    ])
    expect(progressOf(s.runs['r1']!)).toBe(0.5)
  })

  it('zählt einen doppelt gemeldeten Schritt-Erfolg nicht doppelt', () => {
    const s = reduceEvents([
      created(),
      plan(),
      ev('step_succeeded', 'running', {}, { stepId: 's1' }),
      ev('step_succeeded', 'running', {}, { stepId: 's1' })
    ])
    expect(s.runs['r1']!.stepsDone).toBe(1)
  })
})

describe('Erfolg', () => {
  it('wird ohne Verifikation nicht angenommen', () => {
    const s = reduceEvents([created(), plan(), ev('run_succeeded', 'succeeded', {})])
    expect(s.runs['r1']!.status).toBe('running')
    expect(s.runs['r1']!.protocolErrors[0]).toMatch(/run_succeeded/)
  })

  it('wird mit Verifikation angenommen und beendet den Run', () => {
    const s = reduceEvents([created(), plan(), ev('run_succeeded', 'succeeded', { verification: '2 Dateien geprüft' })])
    expect(s.runs['r1']!.status).toBe('succeeded')
    expect(s.runs['r1']!.verification).toBe('2 Dateien geprüft')
    expect(s.runs['r1']!.endedAt).toBeDefined()
  })

  it('ignoriert Schritt-Events nach Abschluss und protokolliert sie', () => {
    const s = reduceEvents([
      created(),
      ev('run_cancelled', 'cancelled', { reason: 'Nutzer' }),
      ev('step_succeeded', 'running', {}, { stepId: 's1' })
    ])
    expect(s.runs['r1']!.status).toBe('cancelled')
    expect(s.runs['r1']!.stepsDone).toBe(0)
    expect(s.runs['r1']!.protocolErrors).toHaveLength(1)
  })
})

describe('Replay und Quellen', () => {
  it('ignoriert Events mit bereits gesehener ID', () => {
    const e = created()
    const once = applyEvent(initialState, e)
    expect(applyEvent(once, e)).toBe(once)
  })

  it('sortiert nach seq, egal in welcher Reihenfolge die Events eintreffen', () => {
    const a = created()
    const b = plan()
    expect(reduceEvents([b, a]).runs['r1']!.planReady).toBe(true)
  })

  it('lehnt Demo-Events für einen Live-Run ab', () => {
    const s = reduceEvents([created(), ev('plan_ready', 'running', { steps: [] }, { source: 'demo' })])
    expect(s.runs['r1']!.planReady).toBe(false)
    expect(s.runs['r1']!.protocolErrors[0]).toMatch(/Quelle demo/)
  })
})

describe('Freigaben', () => {
  const requested = () =>
    ev('approval_requested', 'waiting_approval', {
      approvalId: 'ap1',
      action: 'Dateien verschieben',
      target: 'C:/Test',
      data: '12 Dateien',
      impact: 'Ordnerstruktur ändert sich'
    })

  it('setzt den Run auf waiting_approval und listet die offene Freigabe', () => {
    const s = reduceEvents([created(), plan(), requested()])
    expect(s.runs['r1']!.status).toBe('waiting_approval')
    expect(selectPendingApprovals(s).map((a) => a.id)).toEqual(['ap1'])
    expect(selectAgents(s)[0]!.state).toBe('waiting')
  })

  it('entfernt die Freigabe nach Entscheidung aus der offenen Liste', () => {
    const s = reduceEvents([
      created(),
      plan(),
      requested(),
      ev('approval_resolved', 'running', { approvalId: 'ap1', decision: 'allow' })
    ])
    expect(selectPendingApprovals(s)).toHaveLength(0)
    expect(s.approvals['ap1']!.decision).toBe('allow')
  })

  it('protokolliert eine Entscheidung zu einer unbekannten Freigabe', () => {
    const s = reduceEvents([created(), ev('approval_resolved', 'running', { approvalId: 'x', decision: 'allow' })])
    expect(s.runs['r1']!.protocolErrors[0]).toMatch(/unbekannte Freigabe/)
  })
})

describe('Selektoren', () => {
  it('leitet Agentenzustände aus dem Run-Status ab', () => {
    expect(selectAgents(reduceEvents([created()]))[0]!.state).toBe('planning')
    resetSeq()
    expect(selectAgents(reduceEvents([created(), plan()]))[0]!.state).toBe('executing')
    resetSeq()
    expect(selectAgents(reduceEvents([created(), ev('run_failed', 'failed', { error: 'x' })]))[0]!.state).toBe('failed')
  })

  it('summiert Kosten je Run ohne Doppelzählung', () => {
    const s = reduceEvents([
      created(),
      ev('cost_updated', 'running', { totalUsd: 0.01 }),
      ev('cost_updated', 'running', { totalUsd: 0.03 })
    ])
    expect(selectKpis(s).costUsd).toBeCloseTo(0.03)
    expect(selectCostSeries(s).map((p) => p.usd)).toEqual([0.01, 0.03])
  })

  it('zählt erfolgreiche und fehlgeschlagene Runs', () => {
    const s = reduceEvents([
      created(),
      ev('run_created', 'queued', { title: 'B' }, { runId: 'r2' }),
      ev('run_succeeded', 'succeeded', { verification: 'ok' }),
      ev('run_failed', 'failed', { error: 'x' }, { runId: 'r2' })
    ])
    expect(selectKpis(s)).toMatchObject({ total: 2, succeeded: 1, failed: 1, active: 0 })
  })
})
