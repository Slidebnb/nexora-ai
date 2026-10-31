import { useEffect, useRef } from 'react'

/**
 * Gemeinsamer rAF-Loop für Canvas-Effekte: pausiert bei verstecktem Fenster und
 * läuft gar nicht bei prefers-reduced-motion (dann wird einmal statisch gezeichnet).
 */
export function useAnimationLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  setup: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    frame: (t: number, dt: number) => void
    resize?: (width: number, height: number) => void
    dispose?: () => void
  },
  reduced: boolean
): void {
  const setupRef = useRef(setup)
  setupRef.current = setup

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const fx = setupRef.current(canvas, ctx)

    const fit = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fx.resize?.(w, h)
      if (reduced) fx.frame(0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      fx.frame(now / 1000, dt)
      raf = requestAnimationFrame(loop)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }
    if (!reduced) raf = requestAnimationFrame(loop)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      fx.dispose?.()
    }
  }, [canvasRef, reduced])
}
