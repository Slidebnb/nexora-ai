/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/RadarSweep.tsx (MIT laut README).
 * Rein dekorativ. Änderungen für NEXORA: Theme-Farben statt Grün/Rot, gemeinsamer Animations-Loop
 * (Pause bei verstecktem Fenster, reduced motion), die irreführende Beschriftung „THREAT RADAR / TARGETS“
 * entfernt (vorgetäuschte Statusangabe, keine Optik). Die Punkte sind abstrakte Deko, keine echten Ziele.
 */
import { useRef } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useAnimationLoop } from './useAnimationLoop'
import { themeColors } from '../../lib/themeColor'

export function RadarSweep({ opacity = 0.5 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useAnimationLoop(
    canvasRef,
    (_canvas, ctx) => {
      let w = 0
      let h = 0
      let angle = 0
      const blips: { angle: number; dist: number; alpha: number; size: number }[] = []
      return {
        resize: (width, height) => {
          w = width
          h = height
        },
        frame: () => {
          const { accent, hi } = themeColors()
          const cx = w / 2
          const cy = h / 2
          const radius = Math.min(cx, cy) - 10
          ctx.clearRect(0, 0, w, h)
          if (radius <= 2) return
          ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.3)`
          ctx.lineWidth = 1
          for (let r = 0.25; r <= 1; r += 0.25) {
            ctx.beginPath()
            ctx.arc(cx, cy, radius * r, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.beginPath()
          ctx.moveTo(cx - radius, cy)
          ctx.lineTo(cx + radius, cy)
          ctx.moveTo(cx, cy - radius)
          ctx.lineTo(cx, cy + radius)
          ctx.stroke()
          const sweep = 0.8
          const grad = ctx.createConicGradient(angle - sweep, cx, cy)
          grad.addColorStop(0, 'transparent')
          grad.addColorStop(sweep / (Math.PI * 2), `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.3)`)
          grad.addColorStop(sweep / (Math.PI * 2) + 0.001, 'transparent')
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
          ctx.strokeStyle = `rgb(${accent[0]}, ${accent[1]}, ${accent[2]})`
          ctx.lineWidth = 2
          ctx.stroke()
          for (let i = blips.length - 1; i >= 0; i--) {
            const b = blips[i]!
            const bx = cx + Math.cos(b.angle) * b.dist * radius
            const by = cy + Math.sin(b.angle) * b.dist * radius
            ctx.beginPath()
            ctx.arc(bx, by, b.size, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${hi[0]}, ${hi[1]}, ${hi[2]}, ${b.alpha})`
            ctx.fill()
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.size * 3)
            g.addColorStop(0, `rgba(${hi[0]}, ${hi[1]}, ${hi[2]}, ${b.alpha * 0.4})`)
            g.addColorStop(1, 'transparent')
            ctx.fillStyle = g
            ctx.fillRect(bx - b.size * 3, by - b.size * 3, b.size * 6, b.size * 6)
            b.alpha -= 0.003
            if (b.alpha <= 0) blips.splice(i, 1)
          }
          if (Math.random() > 0.92) blips.push({ angle: Math.random() * Math.PI * 2, dist: 0.2 + Math.random() * 0.7, alpha: 1, size: 2 + Math.random() * 3 })
          angle += 0.02
        }
      }
    },
    reduced
  )
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity }} />
}
