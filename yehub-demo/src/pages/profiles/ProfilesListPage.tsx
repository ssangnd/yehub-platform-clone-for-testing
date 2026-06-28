import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { hasGlobalModuleAccess } from '@/lib/constants/roles'
import { Plus, Users, Download, Upload, Filter, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { mockProfiles } from '@/mocks/fixtures/profiles'
import { mockCategories } from '@/pages/profiles/SegmentsPage'
import { mockTiers } from '@/pages/profiles/TiersPage'
import { COLOR_PRESETS } from '@/lib/constants/colors'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { toast } from 'sonner'
import type { Profile, Gender } from '@/types/profile'

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

const MAX_VISIBLE_CIRCLES = 3

function getCategorySwatch(name: string): string {
  const cat = mockCategories.find(c => c.name === name)
  return cat ? COLOR_PRESETS[cat.color].swatch : 'bg-gray-400'
}

function getTierBadgeClass(name: string): string {
  const tier = mockTiers.find(t => t.name === name)
  return tier ? `${COLOR_PRESETS[tier.color].badge} border-0` : ''
}

function CategoryCircles({ categories }: { categories: string[] }) {
  if (categories.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  const visible = categories.slice(0, MAX_VISIBLE_CIRCLES)
  const overflow = categories.slice(MAX_VISIBLE_CIRCLES)

  return (
    <TooltipProvider>
      <div className="flex items-center">
        {visible.map((cat, i) => (
          <Tooltip key={cat}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-full text-white text-xs font-bold ring-2 ring-background',
                  getCategorySwatch(cat),
                  i > 0 && '-ml-2'
                )}
              >
                {cat[0]}
              </div>
            </TooltipTrigger>
            <TooltipContent>{cat}</TooltipContent>
          </Tooltip>
        ))}
        {overflow.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-full bg-muted text-muted-foreground text-xs font-bold ring-2 ring-background -ml-2 cursor-default'
                )}
              >
                +{overflow.length}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-0.5">
                {overflow.map(cat => (
                  <span key={cat}>{cat}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

const TIERS = ['Mega', 'Macro', 'Mid-tier', 'Micro', 'Nano']
const PLATFORMS_FILTER: { value: string; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'threads', label: 'Threads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
]

export default function ProfilesListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { visibleProfileCategories } = useAppSettings()
  const canWriteProfiles = user && hasGlobalModuleAccess(user.globalRole, 'profiles', 'write')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [tierFilter, setTierFilter] = useState<string[]>([])
  const [platformFilter, setPlatformFilter] = useState<string[]>([])
  const [genderFilter, setGenderFilter] = useState<Gender[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCategoryFilter(prev => prev.filter(c => visibleProfileCategories.includes(c)))
  }, [visibleProfileCategories])

  const activeFilterCount = [
    categoryFilter.length > 0,
    tierFilter.length > 0,
    platformFilter.length > 0,
    genderFilter.length > 0,
  ].filter(Boolean).length

  const handleClearFilters = () => {
    setCategoryFilter([])
    setTierFilter([])
    setPlatformFilter([])
    setGenderFilter([])
  }

  function toggleFilter<T extends string>(arr: T[], value: T, setter: (v: T[]) => void) {
    setter(arr.includes(value) ? arr.filter(item => item !== value) : [...arr, value])
  }

  const filtered = mockProfiles.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchesCategory = categoryFilter.length === 0 || categoryFilter.some(c => p.categories.includes(c))
    const matchesTier = tierFilter.length === 0 || (p.tier !== null && tierFilter.includes(p.tier))
    const matchesPlatform = platformFilter.length === 0 || p.accounts.some(a => platformFilter.includes(a.platform))
    const matchesGender = genderFilter.length === 0 || (p.gender !== null && genderFilter.includes(p.gender))
    return matchesSearch && matchesCategory && matchesTier && matchesPlatform && matchesGender
  })

  const handleExport = () => {
    const getAccountUrl = (p: Profile, platform: string) =>
      p.accounts.find(a => a.platform === platform)?.profileUrl || ''
    const headers = ['id', 'name', 'tags', 'categories', 'facebook', 'instagram', 'threads', 'tiktok', 'youtube']
    const csv = [
      headers.join(','),
      ...filtered.map(p =>
        [
          p.id,
          `"${p.name}"`,
          `"${p.tags.join(', ')}"`,
          `"${p.categories.join(', ')}"`,
          getAccountUrl(p, 'facebook'),
          getAccountUrl(p, 'instagram'),
          getAccountUrl(p, 'threads'),
          getAccountUrl(p, 'tiktok'),
          getAccountUrl(p, 'youtube'),
        ].join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'profiles.csv'
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filtered.length} profiles`)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    toast.success(`Importing profiles from ${file.name}`)
    e.target.value = ''
  }

  const columns: Column<Profile>[] = [
    {
      key: 'name',
      header: 'Profile',
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={p.accounts[0]?.avatarUrl} alt={p.name} />
            <AvatarFallback>{p.name[0]}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{p.name}</span>
        </div>
      ),
    },
    {
      key: 'categories',
      header: 'Category',
      render: (p) => <CategoryCircles categories={p.categories} />,
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (p) => p.tier ? <Badge variant="outline" className={getTierBadgeClass(p.tier)}>{p.tier}</Badge> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'totalFollowers',
      header: 'Followers',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.totalFollowers)}</span>,
    },
    {
      key: 'accounts',
      header: 'Platforms',
      render: (p) => (
        <div className="flex gap-1">
          {p.accounts.map(acc => (
            <PlatformBadge key={acc.id} platform={acc.platform} size="sm" />
          ))}
        </div>
      ),
    },
    {
      key: 'linkedPosts',
      header: 'Linked Posts',
      sortable: true,
      render: (p) => <span className="font-mono">{p.linkedPosts}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profiles"
        description="Manage influencer and brand profiles"
        actions={
          canWriteProfiles ? (
            <Button onClick={() => navigate('/profiles/new')} className="cursor-pointer">
              <Plus className="mr-2 h-4 w-4" />Add Profile
            </Button>
          ) : undefined
        }
      />

      {/* Top 5 by Category */}
      <div className="grid gap-4 md:grid-cols-3">
        {['Beauty', 'Travel', 'Fashion'].map(category => {
          const top5 = mockProfiles
            .filter(p => p.categories.includes(category))
            .sort((a, b) => b.totalFollowers - a.totalFollowers)
            .slice(0, 5)
          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className={cn('h-2.5 w-2.5 rounded-full', getCategorySwatch(category))} />
                  Top {category}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2.5">
                  {top5.map((p, i) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                      onClick={() => navigate(`/profiles/${p.id}`)}
                    >
                      <span className="text-xs text-muted-foreground w-4 text-right font-mono">{i + 1}</span>
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={p.accounts[0]?.avatarUrl} alt={p.name} />
                        <AvatarFallback className="text-xs">{p.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{formatNumber(p.totalFollowers)}</span>
                    </div>
                  ))}
                  {top5.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">No profiles</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search profiles..." className="max-w-md flex-1 sm:flex-none" />
        <Button
          variant={activeFilterCount > 0 ? 'default' : 'outline'}
          onClick={() => setFilterOpen(true)}
          className="shrink-0 cursor-pointer"
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={handleExport} className="cursor-pointer">
          <Download className="mr-2 h-4 w-4" />Export
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
          <Upload className="mr-2 h-4 w-4" />Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {/* Filter Sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="w-80 sm:w-96">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-6 px-4">
            <div className="space-y-2">
              <Label>Category {categoryFilter.length > 0 && <span className="text-muted-foreground font-normal">({categoryFilter.length})</span>}</Label>
              <div className="grid grid-cols-2 gap-2">
                {visibleProfileCategories.map(cat => (
                  <label key={cat} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={categoryFilter.includes(cat)}
                      onCheckedChange={() => toggleFilter(categoryFilter, cat, setCategoryFilter)}
                    />
                    <div className="flex items-center gap-1.5">
                      <div className={cn('h-2.5 w-2.5 rounded-full', getCategorySwatch(cat))} />
                      <span className="text-sm">{cat}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tier {tierFilter.length > 0 && <span className="text-muted-foreground font-normal">({tierFilter.length})</span>}</Label>
              <div className="grid grid-cols-2 gap-2">
                {TIERS.map(tier => (
                  <label key={tier} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={tierFilter.includes(tier)}
                      onCheckedChange={() => toggleFilter(tierFilter, tier, setTierFilter)}
                    />
                    <span className="text-sm">{tier}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Platform {platformFilter.length > 0 && <span className="text-muted-foreground font-normal">({platformFilter.length})</span>}</Label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS_FILTER.map(p => (
                  <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={platformFilter.includes(p.value)}
                      onCheckedChange={() => toggleFilter(platformFilter, p.value, setPlatformFilter)}
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gender {genderFilter.length > 0 && <span className="text-muted-foreground font-normal">({genderFilter.length})</span>}</Label>
              <div className="grid grid-cols-2 gap-2">
                {GENDERS.map(g => (
                  <label key={g.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={genderFilter.includes(g.value)}
                      onCheckedChange={() => toggleFilter(genderFilter, g.value, setGenderFilter)}
                    />
                    <span className="text-sm">{g.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <div className="flex gap-3 w-full">
              <Button variant="outline" onClick={handleClearFilters} className="flex-1 cursor-pointer">
                <X className="mr-2 h-4 w-4" />Clear All
              </Button>
              <Button onClick={() => setFilterOpen(false)} className="flex-1 cursor-pointer">
                Apply
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title="No profiles found" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/profiles/${p.id}`)}
          emptyMessage="No profiles found"
        />
      )}
    </div>
  )
}
