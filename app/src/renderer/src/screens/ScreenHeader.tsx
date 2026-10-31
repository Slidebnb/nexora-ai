export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-xl font-semibold tracking-wide text-text">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-text-2">{subtitle}</p>}
    </header>
  )
}
