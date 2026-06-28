import { CampaignStatus } from '../../generated/prisma/client';

const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE],
  [CampaignStatus.ACTIVE]: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED],
  [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.COMPLETED],
  [CampaignStatus.COMPLETED]: [],
};

export function isValidTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
