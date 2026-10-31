/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/MatrixRain.tsx
 * Lizenz: MIT (laut README des Projekts; Nutzung mit Zustimmung laut Projektinhaber).
 * Änderungen für NEXORA: Crimson-Palette statt Grün, an die Elterngröße statt an das
 * Fenster gebunden, Dichte/Geschwindigkeit über `intensity` an echte Aktivität gekoppelt,
 * gemeinsamer Animations-Loop (Pause bei verstecktem Fenster, reduced motion), TypeScript strict.
 */
import { useRef } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useAnimationLoop } from './useAnimationLoop'
import { rgbHex, themeColors } from '../../lib/themeColor'

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF{}[]<>/\\|'
const FONT_SIZE = 14

interface MatrixRainProps {
  /** 0..1 – 0 = fast still (Leerlauf), 1 = volle Aktivität. */
  intensity: number
  opacity?: number
}

export function MatrixRain({ intensity, opacity = 0.35 }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity

  useAnimationLoop(
    canvasRef,
    (_canvas, ctx) => {
      let width = 0
      let height = 0
      let drops: number[] = []
      let columns: number[] = []

      return {
        resize: (w, h) => {
          width = w
          height = h
          const total = Math.floor(w / FONT_SIZE)
          // nur jede 3. Spalte (wie im Original), über die Breite verteilt
          const count = Math.floor(total / 3)
          drops = Array.from({ length: count }, () => Math.random() * -100)
          columns = Array.from({ length: count }, (_, i) => Math.min(Math.floor(i * 3 + Math.random() * 3), total - 1))
          ctx.clearRect(0, 0, w, h)
        },
        frame: () => {
          const level = intensityRef.current
          const { accent, hi } = themeColors()
          ctx.fillStyle = 'rgba(8, 11, 18, 0.08)'
          ctx.fillRect(0, 0, width, height)
          ctx.font = `${FONT_SIZE}px "Cascadia Mono", Consolas, monospace`
          for (let i = 0; i < drops.length; i++) {
            const char = CHARS[Math.floor(Math.random() * CHARS.length)] ?? '0'
            const x = (columns[i] ?? 0) * FONT_SIZE
            const y = (drops[i] ?? 0) * FONT_SIZE
            const b = Math.random()
            ctx.fillStyle = b > 0.95 ? '#f0f3f9' : b > 0.8 ? rgbHex(hi) : `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.25 + Math.random() * 0.4})`
            ctx.fillText(char, x, y)
            if (y > height && Math.random() > 0.975) drops[i] = 0
            drops[i] = (drops[i] ?? 0) + (0.04 + level * 0.2) * (0.6 + Math.random() * 0.8)
          }
        }
      }
    },
    reduced
  )

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity }} />
}
