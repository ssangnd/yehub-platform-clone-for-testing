import { ApifyRunContext } from './apify-run-context';

describe('ApifyRunContext', () => {
  const context = new ApifyRunContext();

  it('returns undefined outside a run scope', () => {
    expect(context.get()).toBeUndefined();
  });

  it('exposes the meta inside a run scope, across awaits', async () => {
    const meta = {
      jobType: 'post-metrics',
      postId: 'post-1',
      campaignId: 'campaign-1',
    };

    const seen = await context.run(meta, async () => {
      await Promise.resolve();
      return context.get();
    });

    expect(seen).toEqual(meta);
    expect(context.get()).toBeUndefined();
  });

  it('isolates concurrent scopes from each other', async () => {
    const read = (jobType: string) =>
      context.run({ jobType }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return context.get()?.jobType;
      });

    const [a, b] = await Promise.all([
      read('post-metrics'),
      read('post-comments'),
    ]);

    expect(a).toBe('post-metrics');
    expect(b).toBe('post-comments');
  });
});
