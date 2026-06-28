import { Platform } from '../../generated/prisma/client';
import {
  buildExportRow,
  computeAchieved,
  EXPORT_COLUMNS,
  type ExportPostInput,
} from './posts-export';

const base: ExportPostInput = {
  platform: Platform.INSTAGRAM,
  url: 'https://www.instagram.com/p/ABC123/',
  published_at: new Date('2026-06-20T14:30:00.000Z'),
  likes: 100,
  shares: 20,
  views: 5000,
  comment_count: 30,
  last_metric_polled_at: new Date('2026-06-22T00:00:00.000Z'),
  kpi_targets: { engagement: 10000, buzz: 60, interaction: 300, view: 8000 },
  linkedAccount: {
    username: 'kol_handle',
    display_name: 'KOL Name',
    tierName: 'S',
  },
};

describe('computeAchieved', () => {
  it('returns rounded percent with %', () => {
    expect(computeAchieved(150, 300)).toBe('50%');
    expect(computeAchieved(1, 3)).toBe('33%');
  });
  it('returns null when actual or kpi missing or kpi is 0', () => {
    expect(computeAchieved(null, 300)).toBeNull();
    expect(computeAchieved(150, null)).toBeNull();
    expect(computeAchieved(150, 0)).toBeNull();
  });
});

describe('EXPORT_COLUMNS', () => {
  it('lists the 19 headers in order', () => {
    expect(EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Account',
      'Tier',
      'Platform',
      'URL',
      'Posted Date',
      'Achieved Engagement',
      'Achieved Buzz',
      'Achieved Interaction',
      'Achieved View',
      'Engagement KPI',
      'Buzz KPI',
      'Interaction KPI',
      'View KPI',
      'Actual Engagement',
      'Actual Buzz',
      'Actual Interaction',
      'Actual View',
      'Actual Comment',
      'Actual Share',
    ]);
  });
});

describe('buildExportRow', () => {
  it('maps a fully-populated post', () => {
    const r = buildExportRow(base);
    expect(r.account).toBe('KOL Name');
    expect(r.tier).toBe('S');
    expect(r.platform).toBe('INSTAGRAM');
    expect(r.url).toBe('https://www.instagram.com/p/ABC123/');
    // Posted Date is rendered in Asia/Ho_Chi_Minh (UTC+7): 14:30Z -> 21:30
    expect(r.postedDate).toBe('2026-06-20 21:30');
    // actuals match the post detail page (deriveRecordedKpiMetrics):
    // engagement=likes+shares+comments, buzz=comments+shares,
    // interaction=likes+shares+comments+views, view=views,
    // comment=comments, share=shares
    expect(r.actualEngagement).toBe(150);
    expect(r.actualBuzz).toBe(50);
    expect(r.actualInteraction).toBe(5150);
    expect(r.actualView).toBe(5000);
    expect(r.actualComment).toBe(30);
    expect(r.actualShare).toBe(20);
    expect(r.engagementKpi).toBe(10000);
    expect(r.achievedEngagement).toBe('2%'); // round(150/10000*100)
    expect(r.achievedView).toBe('63%'); // round(5000/8000*100)
  });

  it('falls back to username when display_name is empty', () => {
    const r = buildExportRow({
      ...base,
      linkedAccount: { username: 'handle', display_name: null, tierName: null },
    });
    expect(r.account).toBe('handle');
    expect(r.tier).toBeNull();
  });

  it('falls back to username when display_name is an empty string', () => {
    const r = buildExportRow({
      ...base,
      linkedAccount: { username: 'handle', display_name: '', tierName: null },
    });
    expect(r.account).toBe('handle');
    expect(r.tier).toBeNull();
  });

  it('empties account and tier when no linked account', () => {
    const r = buildExportRow({ ...base, linkedAccount: null });
    expect(r.account).toBeNull();
    expect(r.tier).toBeNull();
  });

  it('empties KPI and achieved columns when kpi_targets is null', () => {
    const r = buildExportRow({ ...base, kpi_targets: null });
    expect(r.engagementKpi).toBeNull();
    expect(r.buzzKpi).toBeNull();
    expect(r.achievedEngagement).toBeNull();
    expect(r.achievedView).toBeNull();
    expect(r.actualEngagement).toBe(150); // actuals unaffected
  });

  it('empties actuals and achieved when never metric-polled', () => {
    const r = buildExportRow({ ...base, last_metric_polled_at: null });
    expect(r.actualEngagement).toBeNull();
    expect(r.actualShare).toBeNull();
    expect(r.achievedEngagement).toBeNull();
    expect(r.engagementKpi).toBe(10000); // KPI still shown
  });

  it('shifts the date when UTC+7 crosses midnight', () => {
    const r = buildExportRow({
      ...base,
      published_at: new Date('2026-06-20T20:00:00.000Z'),
    });
    // 20:00Z + 7h -> 03:00 the next day
    expect(r.postedDate).toBe('2026-06-21 03:00');
  });

  it('honors the EXPORT_TIMEZONE env override (IANA name)', () => {
    const prev = process.env.EXPORT_TIMEZONE;
    process.env.EXPORT_TIMEZONE = 'UTC';
    try {
      const r = buildExportRow(base);
      // base published_at is 14:30Z; rendered in UTC it stays 14:30
      expect(r.postedDate).toBe('2026-06-20 14:30');
    } finally {
      if (prev === undefined) delete process.env.EXPORT_TIMEZONE;
      else process.env.EXPORT_TIMEZONE = prev;
    }
  });

  it('empties posted date and url when null', () => {
    const r = buildExportRow({ ...base, published_at: null, url: null });
    expect(r.postedDate).toBeNull();
    expect(r.url).toBeNull();
  });
});
