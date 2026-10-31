/*
 * Portiert aus Davood121/jenman @ 5a19ab9 – artifacts/jarvis/src/components/AiCore.tsx
 * Lizenz: MIT, Copyright (c) 2025 Shaik Davood (siehe THIRD_PARTY_NOTICES.md).
 * Änderungen für NEXORA: Branding, Kardinal- und Fantasiewerte (SUIT, THREAT, SPEED, CPU,
 * PWR, ALT, RNG) entfernt; alle Anzeigen stammen aus echten Run-Events (aktive Agenten,
 * Freigaben, Schritte, Kosten); Segmentring = echter Fortschritt bzw. rotierendes Segment
 * bei unbekanntem Fortschritt; Farbe/Tempo je Agentenzustand; Agenten als Satelliten;
 * Crimson-Palette; reduzierte Schattenunschärfe (Performance); gemeinsamer Animations-Loop
 * mit Pause bei verstecktem Fenster und statischem Bild bei prefers-reduced-motion.
 */
import { useEffect, useRef } from 'react'
import type { AgentView, AgentVisualState } from '../../state/selectors'
import { AGENT_STATE_LABEL } from '../../state/selectors'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useAnimationLoop } from './useAnimationLoop'

type RGB = readonly [number, number, number]

const STATE_COLOR: Record<AgentVisualState, RGB> = {
  idle: [155, 165, 184],
  planning: [255, 107, 136],
  executing: [244, 63, 103],
  waiting: [245, 181, 68],
  done: [74, 222, 128],
  failed: [239, 68, 68]
}
const ACCENT: RGB = [244, 63, 103]
const HIGHLIGHT: RGB = [255, 107, 136]

/** Tempofaktor je Zustand; idle ruhig, executing lebhaft. */
const SPEED: Record<AgentVisualState, number> = { idle: 0.25, planning: 0.8, executing: 1.4, waiting: 0.4, done: 0.3, failed: 0.15 }

const PRIORITY: AgentVisualState[] = ['waiting', 'executing', 'planning', 'failed', 'done', 'idle']

export function overallState(agents: AgentView[]): AgentVisualState {
  return PRIORITY.find((s) => agents.some((a) => a.state === s)) ?? 'idle'
}

export interface OrbitReadouts {
  active: number
  pendingApprovals: number
  steps: string
  cost: string
}

interface OrbitCoreProps {
  agents: AgentView[]
  /** Fortschritt 0..1 des wichtigsten aktiven Laufs, null = unbekannt, undefined = kein Lauf. */
  progress?: number | null
  readouts: OrbitReadouts
}

const TAU = Math.PI * 2

export function OrbitCore({ agents, progress, readouts }: OrbitCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const state = overallState(agents)
  const active = agents.filter((a) => a.state === 'planning' || a.state === 'executing' || a.state === 'waiting').length

  const scene = useRef({ agents, state, progress, readouts })
  scene.current = { agents, state, progress, readouts }
  const redraw = useRef<() => void>(() => undefined)

  useAnimationLoop(
    canvasRef,
    (_canvas, ctx) => {
      let w = 0
      let h = 0
      let phase = 0 // zustandsabhängig integrierte Zeit

      const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
      const ring = (cx: number, cy: number, r: number, lw: number, a: number, dash: number[] = [], rot = 0, col: RGB = ACCENT) => {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rot)
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, TAU)
        ctx.strokeStyle = rgba(col, a)
        ctx.lineWidth = lw
        ctx.setLineDash(dash)
        ctx.stroke()
        ctx.restore()
      }
      const arc = (cx: number, cy: number, r: number, a0: number, a1: number, lw: number, col: RGB, a: number, glow = false) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, r, a0, a1)
        ctx.strokeStyle = rgba(col, a)
        ctx.lineWidth = lw
        if (glow) {
          ctx.shadowColor = rgba(col, 0.8)
          ctx.shadowBlur = 8
        }
        ctx.stroke()
        ctx.restore()
      }
      const tick = (cx: number, cy: number, r1: number, r2: number, a: number, lw: number, al: number, col: RGB = ACCENT) => {
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
        ctx.strokeStyle = rgba(col, al)
        ctx.lineWidth = lw
        ctx.stroke()
      }
      const text = (s: string, x: number, y: number, size: number, al: number, col: RGB = HIGHLIGHT, weight = 400) => {
        ctx.font = `${weight} ${size}px "Cascadia Mono", Consolas, monospace`
        ctx.fillStyle = rgba(col, al)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(s, x, y)
      }

      const draw = (ts: number) => {
        const { agents: list, state: st, progress: prog, readouts: ro } = scene.current
        const col = STATE_COLOR[st]
        const cx = w / 2
        const cy = h / 2
        const base = Math.max(40, Math.min(w, h) / 2 - 34) // Rand für Labels
        const t = phase
        ctx.clearRect(0, 0, w, h)

        // 0. Hintergrund-Glow
        const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.9)
        g0.addColorStop(0, rgba(col, 0.1))
        g0.addColorStop(0.5, rgba(col, 0.03))
        g0.addColorStop(1, 'transparent')
        ctx.fillStyle = g0
        ctx.beginPath()
        ctx.arc(cx, cy, base * 0.9, 0, TAU)
        ctx.fill()

        // 1. Äußerer gestrichelter Ring mit 16 Ticks
        ring(cx, cy, base, 1, 0.18, [4, 8], t * 0.08)
        for (let i = 0; i < 16; i++) {
          const a = (TAU / 16) * i + t * 0.08
          const major = i % 4 === 0
          tick(cx, cy, base - (major ? 14 : 7), base, a, major ? 1.5 : 0.8, major ? 0.7 : 0.35)
        }

        // 2. Segmentring = echter Fortschritt (oder rotierendes Segment bei unbekanntem Fortschritt)
        const r2 = base * 0.84
        const segs = 24
        const rot2 = -t * 0.15
        for (let i = 0; i < segs; i++) {
          const a0 = (TAU / segs) * i + rot2
          const a1 = a0 + (TAU / segs) * 0.72
          let on = false
          if (prog === null) on = (i - Math.floor(t * 4)) % segs < 4 && (i - Math.floor(t * 4)) % segs >= 0
          else if (typeof prog === 'number') on = i < Math.round(segs * prog)
          arc(cx, cy, r2, a0, a1, 3, on ? col : ACCENT, on ? 0.75 : 0.16, on)
        }

        // 3. Diagnosering mit echten Messwerten
        const r3 = base * 0.68
        ring(cx, cy, r3, 1, 0.3, [2, 6], t * 0.22)
        for (let i = 0; i < 8; i++) tick(cx, cy, r3 - 10, r3 + 5, (TAU / 8) * i + t * 0.22, 1, 0.55)
        const labels = [`AKTIV ${ro.active}`, `FREIGABE ${ro.pendingApprovals}`, ro.steps, ro.cost]
        const fs = Math.max(9, Math.round(base * 0.06))
        labels.forEach((l, i) => {
          // Diagonal, damit die Satelliten (oben/rechts/unten/links) frei bleiben
          const a = (TAU / 4) * i - (3 * Math.PI) / 4
          text(l, cx + Math.cos(a) * (r3 + 26), cy + Math.sin(a) * (r3 + 26), fs, 0.65)
        })

        // 4. Radar-Sweep (nur bei Aktivität; sonst nur Radarring)
        const r4 = base * 0.56
        if (st === 'executing' || st === 'planning') {
          const sweep = ((t * 1.2) % TAU) - Math.PI / 2
          const SWEEP = Math.PI * 0.45
          for (let s = 0; s < 30; s++) {
            const f = s / 30
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, r4, sweep - SWEEP * (1 - f), sweep - SWEEP * (1 - f - 1 / 30))
            ctx.closePath()
            ctx.fillStyle = rgba(col, f * 0.12)
            ctx.fill()
          }
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(sweep) * r4, cy + Math.sin(sweep) * r4)
          ctx.strokeStyle = rgba(col, 0.85)
          ctx.lineWidth = 1.5
          ctx.shadowColor = rgba(col, 1)
          ctx.shadowBlur = 6
          ctx.stroke()
          ctx.restore()
        }
        ring(cx, cy, r4, 1, 0.4)
        for (let i = 0; i < 4; i++) tick(cx, cy, r4 - 6, r4 + 4, (TAU / 4) * i, 1, 0.5)

        // 5. Innerer Ring mit Bogen = Anteil aktiver Agenten
        const r5 = base * 0.4
        ring(cx, cy, r5, 1.5, 0.45, [3, 3], -t * 0.4)
        const share = list.length ? list.filter((a) => a.state !== 'idle').length / list.length : 0
        if (share > 0) {
          const pArc = share * TAU
          arc(cx, cy, r5, -Math.PI / 2, -Math.PI / 2 + pArc, 3, col, 0.75, true)
        }

        // 6. Zielkreuz
        const r6 = base * 0.28
        ring(cx, cy, r6, 1, 0.35)
        for (let i = 0; i < 4; i++) {
          const a = (TAU / 4) * i
          arc(cx, cy, r6, a + 0.25, a + Math.PI / 2 - 0.25, 2, ACCENT, 0.7)
          tick(cx, cy, r6 - 10, r6, a + Math.PI / 4, 1, 0.5)
        }

        // 7. Kern aus 6 Bögen, pulsiert bei planning/waiting
        const r7 = base * 0.14
        const pulse = st === 'planning' || st === 'waiting' ? 0.6 + 0.4 * Math.sin(ts * 3) : 1
        const g7 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r7 * 2.5)
        g7.addColorStop(0, rgba(col, 0.28 * pulse))
        g7.addColorStop(0.5, rgba(col, 0.08))
        g7.addColorStop(1, 'transparent')
        ctx.fillStyle = g7
        ctx.beginPath()
        ctx.arc(cx, cy, r7 * 2.5, 0, TAU)
        ctx.fill()
        for (let i = 0; i < 6; i++) {
          const a0 = (TAU / 6) * i + t * 0.5
          arc(cx, cy, r7, a0, a0 + TAU / 12, 4, col, 0.85)
        }
        ring(cx, cy, r7 * 0.55, 1.5, 0.6, [], t * 0.8, col)
        const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, r7 * 0.4)
        gc.addColorStop(0, rgba(col, 0.95))
        gc.addColorStop(1, rgba(col, 0))
        ctx.fillStyle = gc
        ctx.beginPath()
        ctx.arc(cx, cy, r7 * 0.4, 0, TAU)
        ctx.fill()

        // 8. Agenten als Satelliten auf dem Segmentring
        list.forEach((agent, i) => {
          const a = (i / Math.max(1, list.length)) * TAU - Math.PI / 2 + t * 0.05
          const x = cx + Math.cos(a) * r2
          const y = cy + Math.sin(a) * r2
          const ac = STATE_COLOR[agent.state]
          ctx.beginPath()
          ctx.arc(x, y, 6, 0, TAU)
          ctx.fillStyle = rgba(ac, 0.95)
          ctx.fill()
          ring(x, y, 11, 1, 0.45, [], 0, ac)
          ctx.font = '600 11px "Segoe UI", system-ui, sans-serif'
          ctx.fillStyle = 'rgba(240,243,249,0.9)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(agent.name, cx + Math.cos(a) * (r2 + 24), cy + Math.sin(a) * (r2 + 20))
        })
      }

      redraw.current = () => draw(0)
      return {
        resize: (nw, nh) => {
          w = nw
          h = nh
        },
        frame: (ts, dt) => {
          phase += dt * SPEED[scene.current.state]
          draw(ts)
        },
        dispose: () => {
          redraw.current = () => undefined
        }
      }
    },
    reduced
  )

  // Bei reduzierter Bewegung kein Loop: bei Datenänderung einmal neu zeichnen.
  useEffect(() => {
    if (reduced) redraw.current()
  })

  return (
    <div className="relative size-full">
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0" />
      <div className="pointer-events-none absolute left-1 top-0 flex flex-col" aria-live="polite">
        <span className="hud-label">System</span>
        <span className="mt-0.5 text-base font-semibold text-text">{AGENT_STATE_LABEL[state]}</span>
        <span className="text-xs text-text-2">
          {agents.length === 0 ? 'Keine Agenten aktiv' : `${active} von ${agents.length} Agenten aktiv`}
        </span>
      </div>
    </div>
  )
}
