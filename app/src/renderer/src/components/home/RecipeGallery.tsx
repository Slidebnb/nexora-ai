/*
 * Galerie „Fertige Aufgaben" (Rezepte): deutlich erweiterte, kategorisierte Sammlung sofort nutzbarer Anfragen.
 * Jedes Rezept bildet auf eine echte Agent-Fähigkeit ab (siehe data/recipes.ts). Klick füllt das Eingabefeld
 * (sendet nicht automatisch). Mit Suchfeld, damit die Sammlung auch bei vielen Einträgen übersichtlich bleibt.
 */
import { useMemo, useState } from 'react'
import { FileText, Globe, Mail, Monitor, Plug, Search } from 'lucide-react'
import { RECIPE_CATEGORIES, RECIPES } from '../../data/recipes'

const CAT_ICON: Record<string, typeof Mail> = {
  'Recherche & Web': Globe,
  'E-Mail': Mail,
  'Dateien & PDF': FileText,
  'PC steuern': Monitor,
  'Verbundene Dienste': Plug
}

export function RecipeGallery({ onPick }: { onPick: (prompt: string) => void }) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = RECIPES.filter((r) => !q || r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.prompt.toLowerCase().includes(q))
    return RECIPE_CATEGORIES.map((cat) => ({ cat, items: matches.filter((r) => r.category === cat) })).filter((g) => g.items.length > 0)
  }, [query])

  return (
    <div className="mx-auto mt-2 max-w-2xl text-left" aria-label="Fertige Aufgaben">
      <label className="input mx-auto mb-3 flex max-w-xs items-center gap-2 py-0" aria-label="Aufgaben durchsuchen">
        <Search className="size-3.5 text-text-2" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Aufgabe suchen …"
          aria-label="Aufgabe suchen"
          className="w-full bg-transparent py-1.5 text-sm text-text outline-none placeholder:text-text-2/60"
          maxLength={60}
        />
      </label>

      {groups.length === 0 ? (
        <p className="text-center text-sm text-text-2">Keine passende Aufgabe. Schreib einfach frei, was du brauchst.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ cat, items }) => {
            const Icon = CAT_ICON[cat] ?? Globe
            return (
              <div key={cat}>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-2/70">
                  <Icon className="size-3.5 text-accent-hi" aria-hidden /> {cat}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onPick(r.prompt)}
                      className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-text transition-colors hover:border-accent/60 hover:bg-panel-2"
                      title={r.prompt}
                    >
                      {r.title}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
