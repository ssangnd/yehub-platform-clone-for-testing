import { AccountPollingService } from './account-polling.service';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';

describe('AccountPollingService', () => {
  const scraperQueue = { getJob: jest.fn(), add: jest.fn() };
  let service: AccountPollingService;

  beforeEach(() => {
    jest.clearAllMocks();
    scraperQueue.getJob.mockResolvedValue(null);
    scraperQueue.add.mockResolvedValue({});
    service = new AccountPollingService(scraperQueue as any);
  });

  it('enqueues a poll job with the stable account job id', async () => {
    const queued = await service.enqueue('acc-1', { manual: true });

    expect(queued).toBe(true);
    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      { socialAccountId: 'acc-1', manual: true },
      expect.objectContaining({ jobId: 'account-acc-1' }),
    );
  });

  it('defaults manual to false', async () => {
    await service.enqueue('acc-1');

    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      { socialAccountId: 'acc-1', manual: false },
      expect.anything(),
    );
  });

  it('skips when a job for the account is already pending', async () => {
    scraperQueue.getJob.mockResolvedValue({
      isActive: jest.fn().mockResolvedValue(false),
      isWaiting: jest.fn().mockResolvedValue(true),
      isDelayed: jest.fn().mockResolvedValue(false),
    });

    const queued = await service.enqueue('acc-1');

    expect(queued).toBe(false);
    expect(scraperQueue.add).not.toHaveBeenCalled();
  });

  it('enqueueSafe swallows queue errors and returns false', async () => {
    scraperQueue.add.mockRejectedValue(new Error('redis down'));

    await expect(service.enqueueSafe('acc-1')).resolves.toBe(false);
  });
});
