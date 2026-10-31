/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/ScanLines.tsx
 * Lizenz: MIT (laut README des Projekts; Nutzung mit Zustimmung laut Projektinhaber).
 * Änderungen für NEXORA: Crimson-Ton statt Grün, auf den Elterncontainer begrenzt,
 * Keyframes zentral in styles.css (CSP: keine Inline-<style>-Tags), bewegte Linie entfällt
 * bei prefers-reduced-motion (über die globale Regel).
 */
export function ScanLines({ vignette = true }: { vignette?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 1px, rgba(0,0,0,0.15) 1px, rgba(0,0,0,0.15) 2px)'
        }}
      />
      {vignette && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(8,11,18,0.75) 100%)' }} />
      )}
      <div className="scan-move absolute h-0.5 w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(244, 63, 103, 0.18), transparent)' }} />
    </div>
  )
}
