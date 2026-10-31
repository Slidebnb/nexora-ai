/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/WireframeGlobe.tsx (MIT laut README).
 * Rein dekorativ: rotierender Drahtgitter-Globus mit abstrakten Punkten und Bögen. Änderungen für NEXORA:
 * Theme-Farben, gemeinsamer Animations-Loop, die irreführende Beschriftung „GLOBAL NETWORK / NODES“
 * entfernt. Die Punkte stellen keine echten Orte oder Verbindungen dar; nichts wird nach außen gesendet.
 */
import { useRef } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useAnimationLoop } from './useAnimationLoop'
import { themeColors } from '../../lib/themeColor'

export function WireframeGlobe({ opacity = 0.5 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useAnimationLoop(
    canvasRef,
    (_canvas, ctx) => {
      let w = 0
      let h = 0
      let rotY = 0
      const points = Array.from({ length: 30 }, () => ({ lat: (Math.random() - 0.5) * Math.PI, lng: Math.random() * Math.PI * 2, pulse: Math.random() * Math.PI * 2 }))
      const arcs = Array.from({ length: 12 }, () => ({ from: Math.floor(Math.random() * 30), to: Math.floor(Math.random() * 30), alt: Math.random() > 0.5 }))
      return {
        resize: (width, height) => {
          w = width
          h = height
        },
        frame: (t) => {
          const { accent, hi } = themeColors()
          const cx = w / 2
          const cy = h / 2
          const radius = Math.min(cx, cy) - 20
          ctx.clearRect(0, 0, w, h)
          if (radius <= 2) return
          const rotX = 0.3 + Math.sin(t * 0.3) * 0.15
          const project = (lat: number, lng: number) => {
            const x1 = Math.cos(lat) * Math.cos(lng + rotY)
            const y1 = Math.sin(lat)
            const z1 = Math.cos(lat) * Math.sin(lng + rotY)
            const y2 = y1 * Math.cos(rotX) - z1 * Math.sin(rotX)
            const z2 = y1 * Math.sin(rotX) + z1 * Math.cos(rotX)
            return { x: cx + x1 * radius, y: cy + y2 * radius, z: z2 }
          }
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.2)`
          ctx.lineWidth = 1
          ctx.stroke()
          const grid = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.08)`
          for (let lng = 0; lng < Math.PI * 2; lng += Math.PI / 6) {
            ctx.beginPath()
            for (let lat = -Math.PI / 2; lat <= Math.PI / 2; lat += 0.1) {
              const p = project(lat, lng)
              lat === -Math.PI / 2 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            }
            ctx.strokeStyle = grid
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
          for (let lat = -Math.PI / 3; lat <= Math.PI / 3; lat += Math.PI / 6) {
            ctx.beginPath()
            for (let lng = 0; lng <= Math.PI * 2; lng += 0.1) {
              const p = project(lat, lng)
              lng === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            }
            ctx.strokeStyle = grid
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
          for (const a of arcs) {
            const f = points[a.from]!
            const to = points[a.to]!
            const pf = project(f.lat, f.lng)
            const pt = project(to.lat, to.lng)
            if (pf.z > -0.3 || pt.z > -0.3) {
              const c = a.alt ? hi : accent
              ctx.beginPath()
              ctx.moveTo(pf.x, pf.y)
              ctx.quadraticCurveTo((pf.x + pt.x) / 2, (pf.y + pt.y) / 2 - 20, pt.x, pt.y)
              ctx.strokeStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.25)`
              ctx.lineWidth = 1
              ctx.stroke()
            }
          }
          for (const dp of points) {
            const p = project(dp.lat, dp.lng)
            if (p.z > -0.2) {
              const alpha = 0.3 + p.z * 0.7
              const size = 2 + Math.sin(t * 3 + dp.pulse)
              ctx.beginPath()
              ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(${hi[0]}, ${hi[1]}, ${hi[2]}, ${alpha})`
              ctx.fill()
            }
          }
          rotY += 0.005
        }
      }
    },
    reduced
  )
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity }} />
}
