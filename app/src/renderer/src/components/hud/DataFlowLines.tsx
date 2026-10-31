/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/DataFlowLines.tsx
 * Lizenz: MIT (laut README des Projekts; Nutzung mit Zustimmung laut Projektinhaber).
 * Änderungen für NEXORA: Partikel entstehen nicht zufällig, sondern als Impuls je echtem
 * Event (`pulseKey` ändert sich bei jedem neuen Event); Farbe je Eventart (Fehler rot,
 * Freigabe amber, Erfolg grün, sonst Crimson); Partikel fliegen zur Mitte (zum Orbit-Kern);
 * Elterngröße statt Fenster; gemeinsamer Animations-Loop; TypeScript strict.
 */
import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useAnimationLoop } from './useAnimationLoop'
import { rgbHex, themeColors } from '../../lib/themeColor'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  trail: { x: number; y: number }[]
}

export type PulseTone = 'accent' | 'success' | 'warning' | 'danger'
const COLORS: Record<PulseTone, string> = { accent: '#f43f67', success: '#4ade80', warning: '#f5b544', danger: '#ef4444' }

interface DataFlowLinesProps {
  /** Ändert sich bei jedem neuen Event (z. B. Event-seq). */
  pulseKey: number
  tone: PulseTone
}

export function DataFlowLines({ pulseKey, tone }: DataFlowLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const spawnRef = useRef<(tone: PulseTone) => void>(() => undefined)

  useAnimationLoop(
    canvasRef,
    (_canvas, ctx) => {
      const particles: Particle[] = []
      let width = 0
      let height = 0

      spawnRef.current = (t) => {
        for (let n = 0; n < 6; n++) {
          const edge = Math.floor(Math.random() * 4)
          const x = edge === 1 ? width : edge === 3 ? 0 : Math.random() * width
          const y = edge === 0 ? 0 : edge === 2 ? height : Math.random() * height
          // Richtung zur Mitte mit leichter Streuung
          const dx = width / 2 - x
          const dy = height / 2 - y
          const len = Math.hypot(dx, dy) || 1
          const speed = 1.5 + Math.random() * 1.5
          particles.push({
            x,
            y,
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
            life: 0,
            maxLife: len / speed,
            color: t === 'accent' ? rgbHex(themeColors().accent) : COLORS[t],
            size: 1 + Math.random() * 2,
            trail: []
          })
        }
        if (particles.length > 120) particles.splice(0, particles.length - 120)
      }

      return {
        resize: (w, h) => {
          width = w
          height = h
        },
        frame: () => {
          ctx.clearRect(0, 0, width, height)
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i]!
            p.trail.push({ x: p.x, y: p.y })
            if (p.trail.length > 20) p.trail.shift()
            if (p.trail.length > 1) {
              ctx.beginPath()
              ctx.moveTo(p.trail[0]!.x, p.trail[0]!.y)
              for (let t = 1; t < p.trail.length; t++) ctx.lineTo(p.trail[t]!.x, p.trail[t]!.y)
              const alpha = 0.1 + (1 - p.life / p.maxLife) * 0.3
              ctx.strokeStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
              ctx.lineWidth = p.size * 0.5
              ctx.stroke()
            }
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
            ctx.fillStyle = p.color
            ctx.fill()
            p.x += p.vx
            p.y += p.vy
            p.vx += (Math.random() - 0.5) * 0.1
            p.vy += (Math.random() - 0.5) * 0.1
            p.life++
            if (p.life > p.maxLife || p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) particles.splice(i, 1)
          }
        },
        dispose: () => {
          spawnRef.current = () => undefined
        }
      }
    },
    reduced
  )

  useEffect(() => {
    if (pulseKey > 0 && !reduced) spawnRef.current(tone)
  }, [pulseKey, tone, reduced])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 opacity-60" />
}
