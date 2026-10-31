// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApprovalCard } from '../src/renderer/src/components/approvals/ApprovalCenter'
import { ProgressBar } from '../src/renderer/src/components/common/ProgressBar'
import type { ApprovalState } from '../src/renderer/src/state/runReducer'

afterEach(cleanup)

const approval: ApprovalState = {
  id: 'ap1',
  runId: 'r1',
  source: 'demo',
  action: 'Dateien verschieben',
  target: 'C:\\Test',
  data: '48 Dateien',
  impact: 'Ordnerstruktur ändert sich',
  requestedAt: '2026-10-31T10:00:00.000Z'
}

describe('ApprovalCard', () => {
  it('zeigt Aktion, Ziel, Daten, Auswirkung und DEMO-Kennzeichnung', () => {
    render(<ApprovalCard approval={approval} onRespond={() => undefined} />)
    for (const text of ['Dateien verschieben', 'C:\\Test', '48 Dateien', 'Ordnerstruktur ändert sich', 'DEMO']) {
      expect(screen.getByText(text)).toBeTruthy()
    }
  })

  it('meldet die gewählte Entscheidung und fokussiert standardmäßig „Ablehnen“', () => {
    const onRespond = vi.fn()
    render(<ApprovalCard approval={approval} onRespond={onRespond} autoFocus />)
    expect(document.activeElement?.textContent).toBe('Ablehnen')
    fireEvent.click(screen.getByText('Erlauben'))
    fireEvent.click(screen.getByText('Ablehnen'))
    fireEvent.click(screen.getByText('Vorgang abbrechen'))
    expect(onRespond.mock.calls).toEqual([['allow'], ['deny'], ['cancel']])
  })
})

describe('ProgressBar', () => {
  it('meldet unbekannten Fortschritt ohne Zahlenwert', () => {
    render(<ProgressBar value={null} label="x" />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(bar.getAttribute('aria-valuetext')).toBe('Fortschritt unbekannt')
  })

  it('meldet bekannten Fortschritt in Prozent', () => {
    render(<ProgressBar value={0.5} label="x" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
  })
})
