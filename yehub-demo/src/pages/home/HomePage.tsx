import { useNavigate } from 'react-router-dom'
import { Megaphone, Star, TrendingUp, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PortfolioCard {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  path: string | null
  comingSoon?: boolean
  className?: string
  bgImage?: string
}

const portfolioItems: PortfolioCard[] = [
  {
    title: 'Campaign Management',
    description: 'Plan, execute, and monitor social campaigns across all platforms. Track performance in real-time.',
    icon: Megaphone,
    path: '/projects',
    className: 'md:col-span-1 md:row-span-2',
    bgImage: '/campaign-bg.svg',
  },
  {
    title: 'Influencer Directory',
    description: 'Discover and manage KOLs, influencers, and brand ambassadors with detailed analytics.',
    icon: Star,
    path: '/profiles',
    className: 'md:col-span-1 md:row-span-1',
    bgImage: '/influencer-bg.svg',
  },
  {
    title: "What's HOT",
    description: 'Real-time trending topics, viral content, and engagement spikes across your monitored channels.',
    icon: TrendingUp,
    path: '/dashboard',
    className: 'md:col-span-1 md:row-span-1',
    bgImage: '/whats-hot-bg.svg',
  },
  {
    title: 'Incoming Feature',
    description: 'AI-powered sentiment analysis, automated reporting, and predictive insights.',
    icon: Sparkles,
    path: null,
    comingSoon: true,
    className: 'md:col-span-1 md:row-span-1',
  },
]

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-center py-8 px-6">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo.png"
            alt="Yehub & Partners"
            className="h-12 w-auto object-contain"
          />
          <p className="text-sm text-muted-foreground font-medium tracking-wide">
            Welcome to the Platform
          </p>
        </div>
      </header>

      {/* Bento Grid */}
      <main className="flex-1 flex items-start justify-center px-4 sm:px-6 md:px-8 pb-12">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 md:grid-rows-[1fr_1fr] gap-4 md:auto-rows-[minmax(200px,1fr)]">
          {portfolioItems.map((item) => (
            <button
              key={item.title}
              type="button"
              disabled={item.comingSoon}
              onClick={() => item.path && navigate(item.path)}
              className={cn(
                'group relative flex flex-col justify-between rounded-2xl border p-6 sm:p-8 text-left transition-all duration-200 overflow-hidden',
                item.comingSoon
                  ? 'opacity-60 cursor-not-allowed bg-muted/30'
                  : 'cursor-pointer bg-card hover:shadow-xl hover:scale-[1.02] hover:border-primary/30',
                item.className,
              )}
            >
              {/* Background accent */}
              {!item.comingSoon && (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              )}
              {item.bgImage && (
                <div
                  className="absolute inset-0 bg-no-repeat bg-right-bottom bg-contain pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ backgroundImage: `url(${item.bgImage})` }}
                />
              )}

              <div className="relative z-10 space-y-4 flex-1">
                <div className={cn(
                  'inline-flex items-center justify-center h-12 w-12 rounded-xl',
                  item.comingSoon
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/10 text-primary'
                )}>
                  <item.icon className="h-6 w-6" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
                      {item.title}
                    </h2>
                    {item.comingSoon && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              {!item.comingSoon && (
                <div className="relative z-10 mt-6 flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span>Explore</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              )}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
