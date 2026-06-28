import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { cn } from '@/lib/utils'
import { profilesFilterSchema, type ProfilesFilterValues } from '@/lib/schemas'
import type { KolCategory } from '@/api/kol-categories'
import type { KolTier } from '@/api/kol-tiers'
import type { PlatformType } from '@/api/profiles'

const PLATFORMS_FILTER: { value: PlatformType; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'THREADS', label: 'Threads' },
]

const GENDERS_FILTER: { value: string; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
]

export interface ProfilesFilterParams {
  categoryIds?: string
  tierIds?: string
  platforms?: string
  genders?: string
  tags?: string
}

interface FiltersSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: KolCategory[]
  tiers: KolTier[]
  tags: string[]
  filters: ProfilesFilterParams
  onApply: (filters: ProfilesFilterParams) => void
}

const EMPTY: ProfilesFilterValues = { categoryIds: [], tierIds: [], platforms: [], genders: [], tags: [] }

function getColorPreset(color: string) {
  return COLOR_PRESETS[color as ColorKey] ?? COLOR_PRESETS.gray
}

function toFormValues(f: ProfilesFilterParams): ProfilesFilterValues {
  return {
    categoryIds: f.categoryIds ? f.categoryIds.split(',') : [],
    tierIds: f.tierIds ? f.tierIds.split(',') : [],
    platforms: f.platforms ? f.platforms.split(',') : [],
    genders: f.genders ? f.genders.split(',') : [],
    tags: f.tags ? f.tags.split(',') : [],
  }
}

function toParams(values: ProfilesFilterValues): ProfilesFilterParams {
  return {
    categoryIds: values.categoryIds.length > 0 ? values.categoryIds.join(',') : undefined,
    tierIds: values.tierIds.length > 0 ? values.tierIds.join(',') : undefined,
    platforms: values.platforms.length > 0 ? values.platforms.join(',') : undefined,
    genders: values.genders.length > 0 ? values.genders.join(',') : undefined,
    tags: values.tags.length > 0 ? values.tags.join(',') : undefined,
  }
}

function toggleValue(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((item) => item !== value) : [...arr, value]
}

export function FiltersSheet({ open, onOpenChange, categories, tiers, tags, filters, onApply }: FiltersSheetProps) {
  const form = useForm<ProfilesFilterValues>({
    resolver: zodResolver(profilesFilterSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (open) form.reset(toFormValues(filters))
  }, [open, filters, form])

  const handleSubmit = form.handleSubmit((values) => {
    onApply(toParams(values))
    onOpenChange(false)
  })

  const handleClear = () => form.reset(EMPTY)

  const watched = useWatch({ control: form.control })
  const categoryIds = watched.categoryIds ?? []
  const tierIds = watched.tierIds ?? []
  const platforms = watched.platforms ?? []
  const genders = watched.genders ?? []
  const tagsSelected = watched.tags ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4">
              <FormField
                control={form.control}
                name="categoryIds"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>
                      Category{' '}
                      {categoryIds.length > 0 && (
                        <span className="text-muted-foreground font-normal">({categoryIds.length})</span>
                      )}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => (
                        <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(cat.id)}
                            onCheckedChange={() => field.onChange(toggleValue(field.value, cat.id))}
                          />
                          <div className="flex items-center gap-1.5">
                            <div className={cn('h-2.5 w-2.5 rounded-full', getColorPreset(cat.color).swatch)} />
                            <span className="text-sm">{cat.name}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tierIds"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>
                      Tier{' '}
                      {tierIds.length > 0 && (
                        <span className="text-muted-foreground font-normal">({tierIds.length})</span>
                      )}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {tiers.map((tier) => (
                        <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(tier.id)}
                            onCheckedChange={() => field.onChange(toggleValue(field.value, tier.id))}
                          />
                          <span className="text-sm">{tier.name}</span>
                        </label>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platforms"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>
                      Platform{' '}
                      {platforms.length > 0 && (
                        <span className="text-muted-foreground font-normal">({platforms.length})</span>
                      )}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLATFORMS_FILTER.map((p) => (
                        <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(p.value)}
                            onCheckedChange={() => field.onChange(toggleValue(field.value, p.value))}
                          />
                          <span className="text-sm">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="genders"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>
                      Gender{' '}
                      {genders.length > 0 && (
                        <span className="text-muted-foreground font-normal">({genders.length})</span>
                      )}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {GENDERS_FILTER.map((g) => (
                        <label key={g.value} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(g.value)}
                            onCheckedChange={() => field.onChange(toggleValue(field.value, g.value))}
                          />
                          <span className="text-sm">{g.label}</span>
                        </label>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>
                      Tags{' '}
                      {tagsSelected.length > 0 && (
                        <span className="text-muted-foreground font-normal">({tagsSelected.length})</span>
                      )}
                    </Label>
                    {tags.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No tags available</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {tags.map((tag) => (
                          <label key={tag} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={field.value.includes(tag)}
                              onCheckedChange={() => field.onChange(toggleValue(field.value, tag))}
                            />
                            <span className="text-sm truncate">{tag}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </FormItem>
                )}
              />
            </div>
            <SheetFooter>
              <div className="flex gap-3 w-full">
                <Button type="button" variant="outline" onClick={handleClear} className="flex-1 cursor-pointer">
                  <X className="mr-2 h-4 w-4" />
                  Clear All
                </Button>
                <Button type="submit" className="flex-1 cursor-pointer">
                  Apply
                </Button>
              </div>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
