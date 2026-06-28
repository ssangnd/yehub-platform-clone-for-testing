import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Filter, Users } from 'lucide-react'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { DataTable, type Column } from '@/components/common/DataTable'
import { PaginationBar } from '@/components/common/PaginationBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { ROUTES } from '@/lib/constants/routes'
import { Badge } from '@/components/ui/badge'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProfilesList } from './use-profiles-list'
import { FiltersSheet } from './components/FiltersSheet'
import type { Profile } from '@/api/profiles'

const MAX_VISIBLE_CATEGORIES = 3

const numberFormatter = new Intl.NumberFormat('en-US')

function getColorPreset(color: string) {
  return COLOR_PRESETS[color as ColorKey] ?? COLOR_PRESETS.gray
}

export function ProfilesListPage() {
  const navigate = useNavigate()
  const {
    profiles,
    meta,
    isLoading,
    categories,
    tiers,
    tags,
    search,
    setSearch,
    page,
    setPage,
    sortBy,
    sortOrder,
    handleSort,
    filters,
    setFilters,
  } = useProfilesList()

  const [filterOpen, setFilterOpen] = useState(false)

  const activeFilterCount = [
    filters.categoryIds,
    filters.tierIds,
    filters.platforms,
    filters.genders,
    filters.tags,
  ].filter(Boolean).length

  // `setSearch` (setParam) already resets pagination to page 1 internally, so a
  // separate `setPage(1)` here would fire a second URL write in the same tick and
  // clobber the `q` param — leaving the controlled input empty as you type.
  const handleSearchChange = (value: string) => {
    setSearch(value)
  }

  const columns: Column<Profile>[] = [
    {
      key: 'name',
      header: 'Profile',
      render: (p) => (
        <div className="flex items-center gap-3">
          <PresignedAvatar
            imageKey={p.avatar}
            alt={p.name}
            fallback={p.name[0]?.toUpperCase() ?? '?'}
            className="size-8"
          />
          <span className="font-medium">{p.name}</span>
        </div>
      ),
    },
    {
      key: 'categories',
      header: 'Categories',
      render: (p) => {
        if (p.categories.length === 0) {
          return <span className="text-muted-foreground">--</span>
        }
        const visible = p.categories.slice(0, MAX_VISIBLE_CATEGORIES)
        const overflow = p.categories.length - MAX_VISIBLE_CATEGORIES
        return (
          <div className="flex flex-wrap gap-1">
            {visible.map((cat) => {
              const preset = getColorPreset(cat.color)
              return (
                <Badge key={cat.id} variant="outline" className={cn(preset.badge, 'border-0')}>
                  {cat.name}
                </Badge>
              )
            })}
            {overflow > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                +{overflow}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (p) => {
        if (!p.tier) return <span className="text-muted-foreground">--</span>
        const preset = getColorPreset(p.tier.color)
        return (
          <Badge variant="outline" className={cn(preset.badge, 'border-0')}>
            {p.tier.name}
          </Badge>
        )
      },
    },
    {
      key: 'totalFollowers',
      header: 'Followers',
      sortable: true,
      render: (p) => <span className="font-mono">{numberFormatter.format(p.totalFollowers)}</span>,
    },
    {
      key: 'platforms',
      header: 'Platforms',
      render: (p) => {
        const uniquePlatforms = [...new Set(p.accounts.map((a) => a.platform))]
        if (uniquePlatforms.length === 0) {
          return <span className="text-muted-foreground">--</span>
        }
        return (
          <div className="flex gap-1">
            {uniquePlatforms.map((platform) => (
              <PlatformBadge key={platform} platform={platform} size="sm" />
            ))}
          </div>
        )
      },
    },
  ]

  return (
    <PageWrapper>
      <PageHeader
        title="Profiles"
        actions={
          <Button onClick={() => navigate(ROUTES.PROFILES_NEW)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Add Profile
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          placeholder="Search by name or paste a profile URL..."
          className="max-w-md flex-1 sm:flex-none"
        />
        <Button
          variant={activeFilterCount > 0 ? 'default' : 'outline'}
          onClick={() => setFilterOpen(true)}
          className="shrink-0 cursor-pointer"
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1.5 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      <FiltersSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        categories={categories}
        tiers={tiers}
        tags={tags}
        filters={filters}
        onApply={setFilters}
      />

      {!isLoading && profiles.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title="No profiles found" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={profiles}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => navigate(`${ROUTES.PROFILES}/${p.id}`)}
            emptyMessage="No profiles found"
            sortKey={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
          {meta && <PaginationBar page={page} setPage={setPage} totalPages={meta.totalPages} />}
        </>
      )}
    </PageWrapper>
  )
}
