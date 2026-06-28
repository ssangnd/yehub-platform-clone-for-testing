import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CampaignObjectiveTab } from './components/CampaignObjectiveTab'
import { ProjectCategoryTab } from './components/ProjectCategoryTab'
import { AppearanceTab } from './components/AppearanceTab'

export default function AdminSettingsPage() {
  const [tab, setTab] = useState('campaign-objective')

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Platform-wide configuration" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaign-objective" className="cursor-pointer">Campaign Objective</TabsTrigger>
          <TabsTrigger value="project-category" className="cursor-pointer">Project Category</TabsTrigger>
          <TabsTrigger value="appearance" className="cursor-pointer">Appearance</TabsTrigger>
        </TabsList>
        <TabsContent value="campaign-objective" className="mt-6">
          <CampaignObjectiveTab />
        </TabsContent>
        <TabsContent value="project-category" className="mt-6">
          <ProjectCategoryTab />
        </TabsContent>
        <TabsContent value="appearance" className="mt-6">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
