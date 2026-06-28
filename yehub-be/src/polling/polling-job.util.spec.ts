import type { Job } from 'bullmq';
import {
  accountWorkJobId,
  accountWorkJobOptions,
  isJobPending,
  schedulerId,
  workJobId,
  workJobOptions,
} from './polling-job.util';

const fakeJob = (states: {
  active?: boolean;
  waiting?: boolean;
  delayed?: boolean;
}): Job =>
  ({
    isActive: () => Promise.resolve(states.active ?? false),
    isWaiting: () => Promise.resolve(states.waiting ?? false),
    isDelayed: () => Promise.resolve(states.delayed ?? false),
  }) as unknown as Job;

describe('polling-job.util', () => {
  it('builds campaign-scoped scheduler ids', () => {
    expect(schedulerId('camp-1', 'post-1', 'metrics')).toBe(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(schedulerId('camp-1', 'post-1', 'comments')).toBe(
      'campaign:camp-1:post:post-1:comments',
    );
  });

  it('builds stable per-dimension work job ids', () => {
    expect(workJobId('post-1', 'metrics')).toBe('post:post-1:metrics');
    expect(workJobId('post-1', 'comments')).toBe('post:post-1:comments');
  });

  it('treats missing jobs as not pending', async () => {
    await expect(isJobPending(undefined)).resolves.toBe(false);
    await expect(isJobPending(null)).resolves.toBe(false);
  });

  it('treats active/waiting/delayed jobs as pending', async () => {
    await expect(isJobPending(fakeJob({ active: true }))).resolves.toBe(true);
    await expect(isJobPending(fakeJob({ waiting: true }))).resolves.toBe(true);
    await expect(isJobPending(fakeJob({ delayed: true }))).resolves.toBe(true);
    await expect(isJobPending(fakeJob({}))).resolves.toBe(false);
  });

  it('builds work job options with a 10-minute platform backoff and per-dimension id', () => {
    expect(workJobOptions('post-1', 'metrics')).toEqual({
      attempts: 3,
      backoff: { type: 'platform', delay: 600_000 },
      removeOnComplete: true,
      removeOnFail: true,
      jobId: 'post:post-1:metrics',
    });
  });

  it('removes work jobs on terminal state so the stable jobId frees up', () => {
    const opts = workJobOptions('post-1', 'comments');
    expect(opts.removeOnComplete).toBe(true);
    expect(opts.removeOnFail).toBe(true);
  });

  it('builds a stable per-account job id', () => {
    expect(accountWorkJobId('acc-1')).toBe('account-acc-1');
  });

  it('builds account job options with platform backoff and removal on terminal states', () => {
    expect(accountWorkJobOptions('acc-1')).toEqual({
      attempts: 3,
      backoff: { type: 'platform', delay: 600_000 },
      removeOnComplete: true,
      removeOnFail: true,
      jobId: 'account-acc-1',
    });
  });
});
