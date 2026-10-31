/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/HexStream.tsx
 * Lizenz: MIT (laut README des Projekts; Nutzung mit Zustimmung laut Projektinhaber).
 * Änderungen für NEXORA: keine Zufallsbytes und kein „Exfiltration“-Text mehr – jede Zeile
 * ist ein echtes Event (seq als Adresse, Bytes = Prüfsumme der Event-ID, Eventtyp);
 * Crimson-Palette, Tailwind-Klassen, TypeScript strict.
 */
import type { NexoraEvent } from '@shared/events'

function checksumBytes(id: string): string {
  let h = 2166136261
  const out: string[] = []
  for (let i = 0; i < 8; i++) {
    for (const ch of id + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    out.push(((h >>> 0) & 0xff).toString(16).padStart(2, '0'))
  }
  return out.join(' ')
}

export function HexStream({ events, lines = 12 }: { events: NexoraEvent[]; lines?: number }) {
  const shown = events.slice(-lines)
  return (
    <div className="rounded-sm border border-accent/20 bg-base/70 p-1.5" aria-label="Event-Stream">
      <div className="mb-1 font-mono text-[10px] text-accent-hi/60">▸ EVENT STREAM</div>
      {shown.length === 0 && <div className="font-mono text-[11px] text-text-2/60">0x00000: warte auf Events …</div>}
      {shown.map((e, i) => (
        <div
          key={e.id}
          className="whitespace-nowrap font-mono text-[11px] leading-[1.4] text-accent-hi"
          style={{ opacity: 0.3 + ((i + 1) / shown.length) * 0.7 }}
        >
          0x{e.seq.toString(16).padStart(5, '0')}: {checksumBytes(e.id)} {e.source === 'demo' ? '[DEMO] ' : ''}
          {e.type}
        </div>
      ))}
    </div>
  )
}
