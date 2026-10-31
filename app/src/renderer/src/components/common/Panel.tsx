import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

interface PanelProps {
  title: string
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function Panel({ title, actions, className, bodyClassName, children }: PanelProps) {
  return (
    <section className={cx('panel flex min-h-0 min-w-0 flex-col', className)} aria-label={title}>
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="hud-label">{title}</h2>
        {actions}
      </header>
      <div className={cx('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-text-2">{children}</p>
}

export function DemoTag() {
  return (
    <span className="rounded-sm border border-warning/60 px-1.5 py-px font-mono text-[10px] font-semibold tracking-widest text-warning">
      DEMO
    </span>
  )
}
