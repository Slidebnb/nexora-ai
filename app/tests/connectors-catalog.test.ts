import { describe, expect, it } from 'vitest'
import { CONNECTOR_CATALOG, CONNECTOR_CATEGORY_ORDER } from '../src/renderer/src/data/connectors'

describe('Konnektor-Katalog', () => {
  it('bietet sehr viele Dienste (mindestens 40)', () => {
    expect(CONNECTOR_CATALOG.length).toBeGreaterThanOrEqual(40)
  })

  it('hat eindeutige IDs', () => {
    const ids = CONNECTOR_CATALOG.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('jeder Dienst hat Name, Beschreibung und eine gültige Kategorie', () => {
    for (const t of CONNECTOR_CATALOG) {
      expect(t.name.trim().length).toBeGreaterThan(0)
      expect(t.desc.trim().length).toBeGreaterThan(0)
      expect(CONNECTOR_CATEGORY_ORDER).toContain(t.category)
    }
  })

  it('enthält den „Eigener Dienst"-Eintrag (ohne Token-Pflicht)', () => {
    const custom = CONNECTOR_CATALOG.find((t) => t.id === 'custom')
    expect(custom).toBeDefined()
    expect(custom?.needsToken).toBe(false)
  })
})
