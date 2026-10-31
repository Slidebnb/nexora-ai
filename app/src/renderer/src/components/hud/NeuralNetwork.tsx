/*
 * Portiert aus ChatDSJ/evil-ai-viz @ cf22a870 – src/components/viz/NeuralNetwork.tsx (MIT laut README).
 * Rein dekorativ: abstraktes Knoten-/Signal-Netz. Änderungen für NEXORA: Theme-Farben, gemeinsamer
 * Animations-Loop, die irreführende Beschriftung „NEURAL ARCHITECTURE v7.3 / STATUS: SELF-IMPROVING“
 * entfernt (vorgetäuschte Statusangabe). Das Netz bildet kein echtes Modell ab.
 */
import { useRef } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useAnimationLoop } from './useAnimationLoop'
import { themeColors } from '../../lib/themeColor'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  layer: number
  idxInLayer: number
  activation: number
}

const LAYERS = [4, 6, 8, 6, 4, 3]

export function NeuralNetwork({ opacity = 0.5 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useAnimationLoop(
    canvasRef,
    (_canvas, ctx) => {
      let w = 0
      let h = 0
      let nodes: Node[] = []
      let connections: [number, number][] = []
      const signals: { from: number; to: number; progress: number; speed: number }[] = []
      const build = () => {
        nodes = []
        connections = []
        for (let l = 0; l < LAYERS.length; l++) {
          const count = LAYERS[l]!
          const layerX = (w / (LAYERS.length + 1)) * (l + 1)
          for (let n = 0; n < count; n++) {
            nodes.push({ x: layerX, y: (h / (count + 1)) * (n + 1), vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, radius: 3 + Math.random() * 2, layer: l, idxInLayer: n, activation: Math.random() })
          }
        }
        let idx = 0
        for (let l = 0; l < LAYERS.length - 1; l++) {
          const nextStart = idx + LAYERS[l]!
          for (let i = 0; i < LAYERS[l]!; i++) for (let j = 0; j < LAYERS[l + 1]!; j++) if (Math.random() > 0.3) connections.push([idx + i, nextStart + j])
          idx += LAYERS[l]!
        }
      }
      return {
        resize: (width, height) => {
          w = width
          h = height
          build()
        },
        frame: (t) => {
          const { accent, hi } = themeColors()
          ctx.clearRect(0, 0, w, h)
          for (const node of nodes) {
            node.x += node.vx
            node.y += node.vy
            node.activation = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + node.x * 0.1))
            const layerX = (w / (LAYERS.length + 1)) * (node.layer + 1)
            if (Math.abs(node.x - layerX) > 15) node.vx *= -1
            const baseY = (h / (LAYERS[node.layer]! + 1)) * (node.idxInLayer + 1)
            if (Math.abs(node.y - baseY) > 10) node.vy *= -1
          }
          for (const [fi, ti] of connections) {
            const f = nodes[fi]!
            const to = nodes[ti]!
            ctx.beginPath()
            ctx.moveTo(f.x, f.y)
            ctx.lineTo(to.x, to.y)
            ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.08 + f.activation * 0.12})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
          if (Math.random() > 0.85 && signals.length < 20 && connections.length) {
            const c = connections[Math.floor(Math.random() * connections.length)]!
            signals.push({ from: c[0], to: c[1], progress: 0, speed: 0.02 + Math.random() * 0.03 })
          }
          for (let i = signals.length - 1; i >= 0; i--) {
            const s = signals[i]!
            const f = nodes[s.from]!
            const to = nodes[s.to]!
            const x = f.x + (to.x - f.x) * s.progress
            const y = f.y + (to.y - f.y) * s.progress
            ctx.beginPath()
            ctx.arc(x, y, 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgb(${hi[0]}, ${hi[1]}, ${hi[2]})`
            ctx.fill()
            s.progress += s.speed
            if (s.progress >= 1) signals.splice(i, 1)
          }
          for (const node of nodes) {
            ctx.beginPath()
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.4 + node.activation * 0.6})`
            ctx.fill()
          }
        }
      }
    },
    reduced
  )
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity }} />
}
