import { useEffect, useMemo, useRef } from 'react'
import type { AgentView, AgentVisualState } from '../../state/selectors'
import { AGENT_STATE_LABEL } from '../../state/selectors'
import { useReducedMotion } from '../../lib/useReducedMotion'

type RGB = readonly [number, number, number]

const STATE_COLOR: Record<AgentVisualState, RGB> = {
  idle: [155, 165, 184],
  planning: [255, 107, 136],
  executing: [244, 63, 103],
  waiting: [245, 181, 68],
  done: [74, 222, 128],
  failed: [239, 68, 68]
}

/** Drehgeschwindigkeit (rad/s) je Zustand; idle ruhig, executing lebhaft. */
const SPEED: Record<AgentVisualState, number> = {
  idle: 0.08,
  planning: 0.35,
  executing: 0.7,
  waiting: 0.15,
  done: 0.1,
  failed: 0.05
}

const PRIORITY: AgentVisualState[] = ['waiting', 'executing', 'planning', 'failed', 'done', 'idle']

export function overallState(agents: AgentView[]): AgentVisualState {
  return PRIORITY.find((s) => agents.some((a) => a.state === s)) ?? 'idle'
}

interface OrbitCoreProps {
  agents: AgentView[]
  /** Fortschritt 0..1 des wichtigsten aktiven Laufs, null = unbekannt, undefined = kein Lauf. */
  progress?: number | null
}

/**
 * Zentraler HUD-Kern (Canvas 2D). Eigenständige Implementierung; Gestaltungsidee
 * konzentrischer Ringe nach jenman/AiCore.tsx (MIT), siehe docs/SOURCE_AUDIT.md.
 * Animation pausiert bei verstecktem Fenster und entfällt bei prefers-reduced-motion.
 */
export function OrbitCore({ agents, progress }: OrbitCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const state = overallState(agents)
  const active = agents.filter((a) => a.state !== 'idle' && a.state !== 'done' && a.state !== 'failed').length

  // Zeichendaten in einer Ref, damit der rAF-Loop nicht bei jedem Event neu startet.
  const scene = useRef({ agents, state, progress })
  scene.current = { agents, state, progress }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let size = 0
    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      size = Math.max(160, Math.min(parent.clientWidth, parent.clientHeight))
      const dpr = window.devicePixelRatio || 1
      canvas.width = size * dpr
      canvas.height = size * dpr
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) draw(0)
    })
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
    let angle = 0
    let last = performance.now()
    let frame = 0

    function draw(t: number) {
      const { agents: list, state: st, progress: prog } = scene.current
      const col = STATE_COLOR[st]
      const accent: RGB = [244, 63, 103]
      const c = size / 2
      const R = size / 2 - 40 // Rand für Agenten-Labels
      ctx!.clearRect(0, 0, size, size)

      // dezenter Hintergrund-Glow (einmal pro Frame, keine Overdraw-Stapel)
      const glow = ctx!.createRadialGradient(c, c, R * 0.1, c, c, R)
      glow.addColorStop(0, rgba(col, 0.16))
      glow.addColorStop(1, rgba(col, 0))
      ctx!.fillStyle = glow
      ctx!.fillRect(0, 0, size, size)

      const ring = (r: number, w: number, a: number, dash: number[] = [], rot = 0, color: RGB = accent) => {
        ctx!.save()
        ctx!.translate(c, c)
        ctx!.rotate(rot)
        ctx!.beginPath()
        ctx!.arc(0, 0, r, 0, Math.PI * 2)
        ctx!.setLineDash(dash)
        ctx!.lineWidth = w
        ctx!.strokeStyle = rgba(color, a)
        ctx!.stroke()
        ctx!.restore()
      }

      ring(R, 1, 0.35)
      ring(R * 0.92, 2, 0.25, [2, 10], angle * 0.5)
      ring(R * 0.74, 1, 0.3, [30, 14], -angle * 0.8)
      ring(R * 0.56, 1.5, 0.35, [4, 6], angle * 1.2)
      ring(R * 0.38, 1, 0.25)

      // Tick-Marken außen
      ctx!.save()
      ctx!.translate(c, c)
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2
        const long = i % 6 === 0
        ctx!.beginPath()
        ctx!.moveTo(Math.cos(a) * (R - (long ? 10 : 5)), Math.sin(a) * (R - (long ? 10 : 5)))
        ctx!.lineTo(Math.cos(a) * R, Math.sin(a) * R)
        ctx!.strokeStyle = rgba(accent, long ? 0.45 : 0.18)
        ctx!.lineWidth = 1
        ctx!.stroke()
      }
      ctx!.restore()

      // Radar-Sweep nur bei Aktivität
      if (st === 'executing' || st === 'planning') {
        ctx!.save()
        ctx!.translate(c, c)
        ctx!.rotate(angle * 2)
        const sweep = ctx!.createConicGradient(0, 0, 0)
        sweep.addColorStop(0, rgba(col, 0.28))
        sweep.addColorStop(0.12, rgba(col, 0))
        sweep.addColorStop(1, rgba(col, 0))
        ctx!.fillStyle = sweep
        ctx!.beginPath()
        ctx!.arc(0, 0, R * 0.9, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.restore()
      }

      // Fortschrittsbogen: echter Wert oder rotierendes Segment (indeterminiert)
      if (prog !== undefined) {
        ctx!.save()
        ctx!.translate(c, c)
        ctx!.rotate(-Math.PI / 2)
        ctx!.beginPath()
        if (prog === null) ctx!.arc(0, 0, R * 0.83, angle * 3, angle * 3 + Math.PI * 0.4)
        else ctx!.arc(0, 0, R * 0.83, 0, Math.PI * 2 * prog)
        ctx!.lineWidth = 4
        ctx!.lineCap = 'round'
        ctx!.strokeStyle = rgba(col, 0.9)
        ctx!.stroke()
        ctx!.restore()
      }

      // Kern: pulsiert bei planning/waiting
      const pulse = st === 'planning' || st === 'waiting' ? 0.5 + 0.5 * Math.sin(t / 350) : 1
      const core = ctx!.createRadialGradient(c, c, 0, c, c, R * 0.3)
      core.addColorStop(0, rgba(col, 0.55 + 0.25 * pulse))
      core.addColorStop(0.6, rgba(col, 0.12))
      core.addColorStop(1, rgba(col, 0))
      ctx!.fillStyle = core
      ctx!.beginPath()
      ctx!.arc(c, c, R * 0.3, 0, Math.PI * 2)
      ctx!.fill()

      // Agenten als Satelliten auf dem mittleren Ring
      list.forEach((agent, i) => {
        const a = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2 + angle * 0.25
        const x = c + Math.cos(a) * R * 0.74
        const y = c + Math.sin(a) * R * 0.74
        const ac = STATE_COLOR[agent.state]
        ctx!.beginPath()
        ctx!.arc(x, y, 6, 0, Math.PI * 2)
        ctx!.fillStyle = rgba(ac, 0.95)
        ctx!.fill()
        ctx!.beginPath()
        ctx!.arc(x, y, 11, 0, Math.PI * 2)
        ctx!.strokeStyle = rgba(ac, 0.4)
        ctx!.lineWidth = 1
        ctx!.stroke()
        ctx!.font = '600 11px "Segoe UI", system-ui, sans-serif'
        ctx!.fillStyle = 'rgba(240,243,249,0.85)'
        ctx!.textAlign = 'center'
        ctx!.textBaseline = 'middle'
        ctx!.fillText(agent.name, c + Math.cos(a) * (R * 0.74 + 30), c + Math.sin(a) * (R * 0.74 + 22))
      })
    }

    function loop(now: number) {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      angle += dt * SPEED[scene.current.state]
      draw(now)
      frame = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden && !reduced) {
        last = performance.now()
        frame = requestAnimationFrame(loop)
      }
    }

    const onRedraw = () => draw(0)
    canvas.addEventListener('nexora-redraw', onRedraw)
    if (reduced) draw(0)
    else frame = requestAnimationFrame(loop)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('nexora-redraw', onRedraw)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced])

  // Bei reduzierter Bewegung neu zeichnen, wenn sich Daten ändern (kein Dauer-Loop).
  const redrawKey = useMemo(() => JSON.stringify([state, progress, agents.map((a) => [a.name, a.state])]), [state, progress, agents])
  useEffect(() => {
    if (!reduced) return
    canvasRef.current?.dispatchEvent(new Event('nexora-redraw'))
  }, [redrawKey, reduced])

  return (
    <div className="relative flex size-full items-center justify-center">
      <canvas ref={canvasRef} aria-hidden />
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
