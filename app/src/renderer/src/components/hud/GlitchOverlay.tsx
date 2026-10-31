/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/GlitchOverlay.tsx (MIT laut README).
 * Rein dekorativ: gelegentlicher kurzer Glitch. Änderungen für NEXORA: Theme-Farben, bei reduced motion
 * aus, DOM-Overlay ohne Zeichnung von Inhalten.
 */
import { useEffect, useState } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { themeColors, rgbHex } from '../../lib/themeColor'

interface Bar {
  top: number
  height: number
  offset: number
  color: string
}

export function GlitchOverlay() {
  const reduced = useReducedMotion()
  const [bars, setBars] = useState<Bar[] | null>(null)

  useEffect(() => {
    if (reduced) return
    let timer: ReturnType<typeof setTimeout>
    const trigger = () => {
      const { accent, hi } = themeColors()
      setBars(
        Array.from({ length: Math.floor(3 + Math.random() * 8) }, () => ({
          top: Math.random() * 100,
          height: 1 + Math.random() * 4,
          offset: (Math.random() - 0.5) * 30,
          color: Math.random() > 0.5 ? `rgba(${accent[0]},${accent[1]},${accent[2]},${0.1 + Math.random() * 0.3})` : `rgba(${hi[0]},${hi[1]},${hi[2]},${0.1 + Math.random() * 0.2})`
        }))
      )
      setTimeout(() => setBars(null), 100 + Math.random() * 200)
    }
    const schedule = () => {
      timer = setTimeout(() => {
        trigger()
        schedule()
      }, 3000 + Math.random() * 12000)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [reduced])

  if (!bars) return null
  const line = rgbHex(themeColors().accent)
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20" style={{ mixBlendMode: 'screen' }}>
      <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(0deg, transparent 0 2px, ${line}0d 2px 4px)`, opacity: 0.8 }} />
      {bars.map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={{ top: `${b.top}%`, left: `${b.offset}%`, width: `${100 + Math.abs(b.offset)}%`, height: `${b.height}%`, background: b.color, transform: `skewX(${(Math.random() - 0.5) * 5}deg)` }}
        />
      ))}
    </div>
  )
}
