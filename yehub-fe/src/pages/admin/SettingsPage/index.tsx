import { useSearchParams } from 'react-router-dom'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PageHeader } from '@/components/common/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSetPageTitle } from '@/hooks/use-page-title'
import { ProjectCategoriesTab } from './components/ProjectCategoriesTab'
import { CampaignObjectivesTab } from './components/CampaignObjectivesTab'
import { AppearanceTab } from './components/AppearanceTab'

type SettingsTab = 'appearance' | 'categories' | 'objectives'

function parseTab(value: string | null): SettingsTab {
  if (value === 'categories') return 'categories'
  if (value === 'objectives') return 'objectives'
  return 'appearance'
}

export function SettingsPage() {
  useSetPageTitle('Settings')
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))

  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  return (
    <PageWrapper>
      <PageHeader title="Settings" description="Manage shared settings used across projects and campaigns." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="appearance" className="cursor-pointer">
            Appearance
          </TabsTrigger>
          <TabsTrigger value="categories" className="cursor-pointer">
            Project Category
          </TabsTrigger>
          <TabsTrigger value="objectives" className="cursor-pointer">
            Campaign Objective
          </TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" className="mt-6">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          <ProjectCategoriesTab />
        </TabsContent>
        <TabsContent value="objectives" className="mt-6">
          <CampaignObjectivesTab />
        </TabsContent>
      </Tabs>
    </PageWrapper>
  )
}
