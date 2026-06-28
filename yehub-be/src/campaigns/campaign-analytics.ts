// Pure date-bucketing helpers for campaign comment-volume analytics, kept free of
// Prisma so they are trivially unit-testable (mirrors campaign-metrics.ts).
export type Granularity = 'day' | 'week';

export interface VolumeBucket {
  date: string; // ISO 'YYYY-MM-DD' bucket start (UTC)
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_MAX_DAYS = 90;

// Daily buckets up to a 90-day span; weekly beyond that to keep the chart readable.
export function pickGranularity(from: Date, to: Date): Granularity {
  const spanDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS);
  return spanDays > DAILY_MAX_DAYS ? 'week' : 'day';
}

function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// Postgres date_trunc('week', ...) starts weeks on Monday; match that here.
function startOfWeekUTC(date: Date): Date {
  const day = startOfDayUTC(date);
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  return day;
}

function bucketStart(date: Date, granularity: Granularity): Date {
  return granularity === 'week' ? startOfWeekUTC(date) : startOfDayUTC(date);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Produces a dense, ordered series across [from, to] with every bucket present.
export function zeroFillBuckets(
  rows: { date: Date; count: number }[],
  from: Date,
  to: Date,
  granularity: Granularity,
): VolumeBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(toISODate(bucketStart(row.date, granularity)), row.count);
  }

  const result: VolumeBucket[] = [];
  const cursor = bucketStart(from, granularity);
  const end = bucketStart(to, granularity);
  while (cursor.getTime() <= end.getTime()) {
    const key = toISODate(cursor);
    result.push({ date: key, count: counts.get(key) ?? 0 });
    if (granularity === 'week') {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return result;
}
