import {
  pickGranularity,
  zeroFillBuckets,
  type VolumeBucket,
} from './campaign-analytics';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('pickGranularity', () => {
  it('uses day for a span of exactly 90 days', () => {
    expect(pickGranularity(d('2026-01-01'), d('2026-04-01'))).toBe('day'); // 90 days
  });

  it('uses week when the span exceeds 90 days', () => {
    expect(pickGranularity(d('2026-01-01'), d('2026-04-02'))).toBe('week'); // 91 days
  });

  it('uses day for a single-day span', () => {
    expect(pickGranularity(d('2026-01-01'), d('2026-01-01'))).toBe('day');
  });
});

describe('zeroFillBuckets (day)', () => {
  it('fills missing days with zero and keeps existing counts', () => {
    const rows = [{ date: d('2026-01-02'), count: 5 }];
    const result = zeroFillBuckets(
      rows,
      d('2026-01-01'),
      d('2026-01-03'),
      'day',
    );
    expect(result).toEqual<VolumeBucket[]>([
      { date: '2026-01-01', count: 0 },
      { date: '2026-01-02', count: 5 },
      { date: '2026-01-03', count: 0 },
    ]);
  });

  it('returns all-zero buckets when rows is empty', () => {
    const result = zeroFillBuckets([], d('2026-01-01'), d('2026-01-02'), 'day');
    expect(result).toEqual<VolumeBucket[]>([
      { date: '2026-01-01', count: 0 },
      { date: '2026-01-02', count: 0 },
    ]);
  });
});

describe('zeroFillBuckets (week)', () => {
  it('aligns buckets to Monday (matching Postgres date_trunc) and zero-fills', () => {
    // 2026-01-05 is a Monday; 2026-01-12 is the next Monday.
    const rows = [{ date: d('2026-01-12'), count: 3 }];
    const result = zeroFillBuckets(
      rows,
      d('2026-01-07'),
      d('2026-01-15'),
      'week',
    );
    expect(result).toEqual<VolumeBucket[]>([
      { date: '2026-01-05', count: 0 },
      { date: '2026-01-12', count: 3 },
    ]);
  });
});
