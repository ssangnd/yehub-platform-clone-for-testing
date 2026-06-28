import { DatePicker } from '@/components/common/DatePicker'
import { MultiSelectDropdown } from '@/components/common/MultiSelectDropdown'
import { Label } from '@/components/ui/label'
import { PLATFORMS } from '@/lib/constants/platforms'
import type { CostFilters, CostFilterOptions } from '@/api/cost'
import type { Platform } from '@/api/campaigns'

const PLATFORM_ITEMS = PLATFORMS.map((p) => ({ id: p.value, name: p.label }))

// Cascade rule: a campaign is visible when no projects are selected,
// or when its project_id is among the selected projects.
const matchesProjects = (projectId: string, projectIds: string[]) =>
  projectIds.length === 0 || projectIds.includes(projectId)

interface Props {
  filters: CostFilters
  onChange: (next: CostFilters) => void
  options?: CostFilterOptions
}

export function CostFilterBar({ filters, onChange, options }: Props) {
  const projectItems = options?.projects ?? []
  const campaignItems = (options?.campaigns ?? []).filter((c) => matchesProjects(c.project_id, filters.project_ids))

  const handleProjects = (project_ids: string[]) => {
    if (!options) return
    const validCampaignIds = new Set(
      options.campaigns.filter((c) => matchesProjects(c.project_id, project_ids)).map((c) => c.id),
    )
    onChange({
      ...filters,
      project_ids,
      campaign_ids: filters.campaign_ids.filter((id) => validCampaignIds.has(id)),
    })
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label>From</Label>
        <DatePicker value={filters.from} onChange={(from) => onChange({ ...filters, from })} />
      </div>
      <div className="space-y-2">
        <Label>To</Label>
        <DatePicker value={filters.to} onChange={(to) => onChange({ ...filters, to })} />
      </div>
      <MultiSelectDropdown
        label="Platforms"
        placeholder="All platforms"
        searchPlaceholder="Search platforms…"
        items={PLATFORM_ITEMS}
        selectedIds={filters.platforms}
        onChange={(ids) => onChange({ ...filters, platforms: ids as Platform[] })}
      />
      <MultiSelectDropdown
        label="Projects"
        placeholder="All projects"
        searchPlaceholder="Search projects…"
        items={projectItems}
        selectedIds={filters.project_ids}
        onChange={handleProjects}
        emptyMessage="No projects available."
      />
      <MultiSelectDropdown
        label="Campaigns"
        placeholder="All campaigns"
        searchPlaceholder="Search campaigns…"
        items={campaignItems}
        selectedIds={filters.campaign_ids}
        onChange={(campaign_ids) => onChange({ ...filters, campaign_ids })}
        emptyMessage="No campaigns for the selected projects."
      />
    </div>
  )
}
