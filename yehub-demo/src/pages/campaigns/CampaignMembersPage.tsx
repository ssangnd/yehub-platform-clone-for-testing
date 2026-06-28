import { useParams } from 'react-router-dom'
import { CampaignMembersTab } from './components/CampaignMembersTab'

export default function CampaignMembersPage() {
  const { campaignId } = useParams()
  if (!campaignId) return null
  return <CampaignMembersTab campaignId={campaignId} />
}
