import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FeatureCardProps {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  comingSoon?: boolean
  className?: string
  bgImage?: string
  onClick?: () => void
}

export function FeatureCard({
  title,
  description,
  icon: Icon,
  comingSoon,
  className,
  bgImage,
  onClick,
}: FeatureCardProps) {
  return (
    <button
      type="button"
      disabled={comingSoon}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-6 text-left transition-all duration-200 sm:p-8',
        comingSoon
          ? 'cursor-not-allowed bg-muted/30 opacity-60'
          : 'bg-card hover:scale-[1.02] hover:border-primary/30 hover:shadow-xl',
        className,
      )}
    >
      {!comingSoon && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
      {bgImage && (
        <div
          className="pointer-events-none absolute inset-0 bg-contain bg-right-bottom bg-no-repeat opacity-80 transition-opacity duration-200 group-hover:opacity-100"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
      )}

      <div className="relative z-10 flex-1 space-y-4">
        <div
          className={cn(
            'inline-flex h-12 w-12 items-center justify-center rounded-xl',
            comingSoon ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
            {comingSoon && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Coming Soon
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>

      {!comingSoon && (
        <div className="relative z-10 mt-6 flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span>Explore</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      )}
    </button>
  )
}
