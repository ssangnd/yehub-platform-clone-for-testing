import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';

const base = {
  name: 'Camp',
  project_id: '11111111-1111-1111-1111-111111111111',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  platforms: ['FACEBOOK'],
};

const errorsFor = (overrides: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateCampaignDto, { ...base, ...overrides }));

describe('CreateCampaignDto polling intervals', () => {
  it('accepts an allowed interval', () => {
    const errs = errorsFor({ metric_polling_interval: 3600 });
    expect(
      errs.find((e) => e.property === 'metric_polling_interval'),
    ).toBeUndefined();
  });

  it('accepts 0 (manual)', () => {
    const errs = errorsFor({ comments_polling_interval: 0 });
    expect(
      errs.find((e) => e.property === 'comments_polling_interval'),
    ).toBeUndefined();
  });

  it('rejects an off-enum interval', () => {
    const errs = errorsFor({ metric_polling_interval: 5000 });
    expect(
      errs.find((e) => e.property === 'metric_polling_interval'),
    ).toBeDefined();
  });
});
