import { cx } from '../../lib/format'

interface ProgressBarProps {
  /** 0..1 oder null für unbekannten Fortschritt. */
  value: number | null
  label: string
  tone?: 'accent' | 'success' | 'warning' | 'danger'
}

const TONE = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }

export function ProgressBar({ value, label, tone = 'accent' }: ProgressBarProps) {
  const indeterminate = value === null
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      aria-valuetext={indeterminate ? 'Fortschritt unbekannt' : `${Math.round(value * 100)} %`}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-panel-2"
    >
      {indeterminate ? (
        <div className={cx('progress-indeterminate absolute inset-y-0 w-1/3 rounded-full', TONE[tone])} />
      ) : (
        <div className={cx('h-full rounded-full transition-[width] duration-500', TONE[tone])} style={{ width: `${value * 100}%` }} />
      )}
    </div>
  )
}
