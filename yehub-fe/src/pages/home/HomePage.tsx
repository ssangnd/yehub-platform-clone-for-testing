import { useNavigate } from 'react-router-dom'
import { Megaphone, Star, TrendingUp, Sparkles } from 'lucide-react'
import { ROUTES } from '@/lib/constants/routes'
import { useSystemLogo } from '@/hooks/use-system-logo'
import { FeatureCard, type FeatureCardProps } from './components/FeatureCard'

type PortfolioItem = Pick<
  FeatureCardProps,
  'title' | 'description' | 'icon' | 'comingSoon' | 'className' | 'bgImage'
> & {
  path: string | null
}

const portfolioItems: PortfolioItem[] = [
  {
    title: 'Campaign Management',
    description: 'Plan, execute, and monitor social campaigns across all platforms. Track performance in real-time.',
    icon: Megaphone,
    path: ROUTES.PROJECTS,
    className: 'md:col-span-1 md:row-span-2',
    bgImage: '/campaign-bg.svg',
  },
  {
    title: 'Influencer Directory',
    description: 'Discover and manage KOLs, influencers, and brand ambassadors with detailed analytics.',
    icon: Star,
    path: ROUTES.PROFILES,
    className: 'md:col-span-1 md:row-span-1',
    bgImage: '/influencer-bg.svg',
  },
  {
    title: "What's HOT",
    description: 'Real-time trending topics, viral content, and engagement spikes across your monitored channels.',
    icon: TrendingUp,
    path: null,
    comingSoon: true,
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
  const { url: logoUrl } = useSystemLogo()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-center px-6 py-8">
        <div className="flex flex-col items-center gap-3">
          <img src={logoUrl} alt="Yehub & Partners" className="h-12 w-auto object-contain" />
          <p className="text-sm font-medium tracking-wide text-muted-foreground">Welcome to the Platform</p>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 sm:px-6 md:px-8">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:auto-rows-[minmax(200px,1fr)] md:grid-cols-2 md:grid-rows-[1fr_1fr]">
          {portfolioItems.map((item) => (
            <FeatureCard
              key={item.title}
              title={item.title}
              description={item.description}
              icon={item.icon}
              comingSoon={item.comingSoon}
              className={item.className}
              bgImage={item.bgImage}
              onClick={item.path ? () => navigate(item.path!) : undefined}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
