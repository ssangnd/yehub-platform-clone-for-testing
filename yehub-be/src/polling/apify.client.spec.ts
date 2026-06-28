import { ApifyClient } from './apify.client';
import { PlatformError, PlatformErrorCode } from './platform-error';

type FetchMock = jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;

describe('ApifyClient', () => {
  const configValues: Record<string, unknown> = {};
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  };
  const recorder = { record: jest.fn() };
  let client: ApifyClient;
  let fetchMock: FetchMock;

  const response = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  });

  const startedRun = {
    id: 'run-1',
    status: 'RUNNING',
    defaultDatasetId: 'dataset-1',
    startedAt: '2026-06-12T00:00:00.000Z',
    finishedAt: null,
  };

  const finishedRun = {
    ...startedRun,
    status: 'SUCCEEDED',
    finishedAt: '2026-06-12T00:01:00.000Z',
    stats: { runTimeSecs: 60, computeUnits: 0.05 },
    usageTotalUsd: 0.012,
    usageUsd: { ACTOR_COMPUTE_UNITS: 0.012 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(configValues)) delete configValues[key];
    configValues.APIFY_TOKEN = 'secret-token';
    configValues.APIFY_TIMEOUT_MS = 120_000;
    configValues.APIFY_MEMORY_MB = 1024;
    recorder.record.mockResolvedValue(undefined);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new ApifyClient(config as any, recorder as any);
  });

  it('starts a run, waits for it to finish and returns the dataset items', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { data: startedRun }))
      .mockResolvedValueOnce(response(200, { data: finishedRun }))
      .mockResolvedValueOnce(response(200, [{ value: 1 }, { value: 2 }]));

    const items = await client.runSync<{ value: number }>({
      actorId: 'apify~facebook-posts-scraper',
      input: { startUrls: [{ url: 'https://example.com' }] },
    });

    expect(items).toEqual([{ value: 1 }, { value: 2 }]);

    const [startUrl, startInit] = fetchMock.mock.calls[0] as [string, any];
    expect(startUrl).toContain('/v2/actors/apify~facebook-posts-scraper/runs');
    expect(startUrl).toContain('memory=1024');
    expect(startUrl).toContain('timeout=120');
    expect(startInit.method).toBe('POST');
    expect(startInit.headers.authorization).toBe('Bearer secret-token');

    const [waitUrl] = fetchMock.mock.calls[1] as [string];
    expect(waitUrl).toContain('/v2/actor-runs/run-1');
    expect(waitUrl).toContain('waitForFinish=');

    const [itemsUrl] = fetchMock.mock.calls[2] as [string];
    expect(itemsUrl).toContain('/v2/datasets/dataset-1/items');
  });

  it('records the finished run with its usage', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { data: startedRun }))
      .mockResolvedValueOnce(response(200, { data: finishedRun }))
      .mockResolvedValueOnce(response(200, []));

    await client.runSync({ actorId: 'actor', input: {} });

    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        apifyRunId: 'run-1',
        actorId: 'actor',
        status: 'SUCCEEDED',
        usageTotalUsd: 0.012,
        runTimeSecs: 60,
        computeUnits: 0.05,
      }),
    );
  });

  it('throws and records when the run fails, without fetching the dataset', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { data: startedRun }))
      .mockResolvedValueOnce(
        response(200, { data: { ...finishedRun, status: 'FAILED' } }),
      );

    await expect(
      client.runSync({ actorId: 'actor', input: {} }),
    ).rejects.toThrow(PlatformError);
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ apifyRunId: 'run-1', status: 'FAILED' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a TIMED-OUT run to a TIMEOUT platform error', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { data: startedRun }))
      .mockResolvedValueOnce(
        response(200, { data: { ...finishedRun, status: 'TIMED-OUT' } }),
      );

    await expect(
      client.runSync({ actorId: 'actor', input: {} }),
    ).rejects.toMatchObject({ code: PlatformErrorCode.TIMEOUT });
  });

  it('aborts the run and throws TIMEOUT when the time budget is exhausted', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { data: startedRun }))
      .mockResolvedValueOnce(
        response(200, { data: { ...startedRun, status: 'ABORTING' } }),
      );

    await expect(
      client.runSync({ actorId: 'actor', input: {}, timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: PlatformErrorCode.TIMEOUT });

    const [abortUrl, abortInit] = fetchMock.mock.calls[1] as [string, any];
    expect(abortUrl).toContain('/v2/actor-runs/run-1/abort');
    expect(abortInit.method).toBe('POST');
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ apifyRunId: 'run-1' }),
    );
  });

  it('maps a 429 on run start to RATE_LIMITED with retry-after', async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        429,
        { error: { type: 'rate-limit-exceeded' } },
        {
          'retry-after': '2',
        },
      ),
    );

    await expect(
      client.runSync({ actorId: 'actor', input: {} }),
    ).rejects.toMatchObject({
      code: PlatformErrorCode.RATE_LIMITED,
      retryAfterMs: 2000,
    });
  });

  it('rejects a non-array dataset response as BAD_RESPONSE', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { data: startedRun }))
      .mockResolvedValueOnce(response(200, { data: finishedRun }))
      .mockResolvedValueOnce(response(200, { not: 'an array' }));

    await expect(
      client.runSync({ actorId: 'actor', input: {} }),
    ).rejects.toMatchObject({ code: PlatformErrorCode.BAD_RESPONSE });
  });

  it('fails fast without fetch when the token is missing', async () => {
    delete configValues.APIFY_TOKEN;

    await expect(
      client.runSync({ actorId: 'actor', input: {} }),
    ).rejects.toMatchObject({ code: PlatformErrorCode.AUTHENTICATION_FAILED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a run snapshot via getRun', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: finishedRun }));

    const snapshot = await client.getRun('run-1');

    expect(fetchMock.mock.calls[0][0]).toContain('/v2/actor-runs/run-1');
    expect(snapshot).toEqual(
      expect.objectContaining({
        status: 'SUCCEEDED',
        usageTotalUsd: 0.012,
        runTimeSecs: 60,
        computeUnits: 0.05,
      }),
    );
  });
});
