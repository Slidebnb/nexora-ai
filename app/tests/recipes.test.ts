import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_CATEGORIES } from '../src/renderer/src/data/recipes'

describe('Fertige Aufgaben (Rezepte)', () => {
  it('sind deutlich erweitert (mindestens 18 Einträge)', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(18)
  })

  it('haben eindeutige IDs', () => {
    const ids = RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('haben nicht-leere Titel und Prompts und eine gültige Kategorie', () => {
    for (const r of RECIPES) {
      expect(r.title.trim().length).toBeGreaterThan(0)
      expect(r.prompt.trim().length).toBeGreaterThan(0)
      expect(RECIPE_CATEGORIES).toContain(r.category)
    }
  })

  it('decken alle Kategorien ab', () => {
    for (const cat of RECIPE_CATEGORIES) {
      expect(RECIPES.some((r) => r.category === cat)).toBe(true)
    }
  })
})
