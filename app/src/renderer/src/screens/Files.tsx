import { ResultCards } from '../components/feed/ResultCards'
import { ScreenHeader } from './ScreenHeader'

export function Files() {
  return (
    <div className="flex h-full flex-col p-6">
      <ScreenHeader
        title="Dateien"
        subtitle="Ergebnisse aus Vorgängen (Tabellen, Dateien, Links, Exporte). Freigegebene Arbeitsordner folgen mit dem Worker."
      />
      <div className="min-h-0 flex-1">
        <ResultCards />
      </div>
    </div>
  )
}
