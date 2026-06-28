import { Job } from 'bullmq';
import { ApifyUsageRefresher } from './apify-usage-refresher';

describe('ApifyUsageRefresher', () => {
  const client = { getRun: jest.fn() };
  const recorder = { updateUsage: jest.fn() };
  let refresher: ApifyUsageRefresher;

  beforeEach(() => {
    jest.clearAllMocks();
    refresher = new ApifyUsageRefresher(client as any, recorder as any);
  });

  it('re-reads the run and stores the finalized usage', async () => {
    const snapshot = {
      status: 'SUCCEEDED',
      finishedAt: new Date('2026-06-12T00:01:00Z'),
      runTimeSecs: 61,
      computeUnits: 0.06,
      usageTotalUsd: 0.013,
      usageUsd: { ACTOR_COMPUTE_UNITS: 0.013 },
    };
    client.getRun.mockResolvedValue(snapshot);
    recorder.updateUsage.mockResolvedValue(undefined);

    await refresher.process({
      data: { apifyRunRowId: 'row-1', apifyRunId: 'run-1' },
    } as Job);

    expect(client.getRun).toHaveBeenCalledWith('run-1');
    expect(recorder.updateUsage).toHaveBeenCalledWith('row-1', snapshot);
  });

  it('propagates failures so BullMQ retries the job', async () => {
    client.getRun.mockRejectedValue(new Error('apify down'));

    await expect(
      refresher.process({
        data: { apifyRunRowId: 'row-1', apifyRunId: 'run-1' },
      } as Job),
    ).rejects.toThrow('apify down');
    expect(recorder.updateUsage).not.toHaveBeenCalled();
  });
});
