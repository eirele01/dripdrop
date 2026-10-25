'use client'

export function EmptyState({
  emoji = '💧',
  title,
  subtitle,
  compact = false,
}: {
  emoji?: string
  title: string
  subtitle?: string
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 text-center ${compact ? 'py-6' : 'py-12'}`}
    >
      <span className={`${compact ? 'text-3xl' : 'text-5xl'} animate-droplet-float`} aria-hidden>
        {emoji}
      </span>
      <p className="text-base font-semibold text-foreground">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
