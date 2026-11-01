/*
 * „Agent-Puls": dezente Live-Visualisierung, die zeigt, dass NEXORA gerade arbeitet. Equalizer-Balken in der
 * Akzentfarbe (CSS-Animation in styles.css, respektiert prefers-reduced-motion). Rein dekorativ → aria-hidden,
 * mit begleitendem Status-Text für Screenreader.
 */
export function AgentPulse({ label = 'arbeitet' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-accent-hi" role="status">
      <span className="agent-eq" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="sr-only">NEXORA {label}</span>
    </span>
  )
}
