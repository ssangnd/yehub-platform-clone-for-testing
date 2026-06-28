import ExcelJS from 'exceljs';
import { Platform } from '../../generated/prisma/client';

export interface ExportPostInput {
  platform: Platform;
  url: string | null;
  published_at: Date | null;
  likes: number;
  shares: number;
  views: number;
  comment_count: number;
  last_metric_polled_at: Date | null;
  kpi_targets: unknown;
  linkedAccount: {
    username: string | null;
    display_name: string | null;
    tierName: string | null;
  } | null;
}

export const EXPORT_COLUMNS = [
  { header: 'Account', key: 'account' },
  { header: 'Tier', key: 'tier' },
  { header: 'Platform', key: 'platform' },
  { header: 'URL', key: 'url' },
  { header: 'Posted Date', key: 'postedDate' },
  { header: 'Achieved Engagement', key: 'achievedEngagement' },
  { header: 'Achieved Buzz', key: 'achievedBuzz' },
  { header: 'Achieved Interaction', key: 'achievedInteraction' },
  { header: 'Achieved View', key: 'achievedView' },
  { header: 'Engagement KPI', key: 'engagementKpi' },
  { header: 'Buzz KPI', key: 'buzzKpi' },
  { header: 'Interaction KPI', key: 'interactionKpi' },
  { header: 'View KPI', key: 'viewKpi' },
  { header: 'Actual Engagement', key: 'actualEngagement' },
  { header: 'Actual Buzz', key: 'actualBuzz' },
  { header: 'Actual Interaction', key: 'actualInteraction' },
  { header: 'Actual View', key: 'actualView' },
  { header: 'Actual Comment', key: 'actualComment' },
  { header: 'Actual Share', key: 'actualShare' },
] as const;

export function computeAchieved(
  actual: number | null,
  kpi: number | null,
): string | null {
  if (actual == null || kpi == null || kpi === 0) return null;
  return `${Math.round((actual / kpi) * 100)}%`;
}

// Timezone used to render dates in the export. Override with the EXPORT_TIMEZONE
// env var (any IANA name, e.g. 'UTC', 'America/New_York').
const DEFAULT_EXPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function postedDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

// 'yyyy-MM-dd HH:mm' in EXPORT_TIMEZONE (default Asia/Ho_Chi_Minh).
function formatPostedDate(date: Date | null): string | null {
  if (!date) return null;
  const timeZone = process.env.EXPORT_TIMEZONE || DEFAULT_EXPORT_TIMEZONE;
  const parts = postedDateFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function readKpi(
  kpiTargets: unknown,
  key: 'engagement' | 'buzz' | 'interaction' | 'view',
): number | null {
  if (!kpiTargets || typeof kpiTargets !== 'object') return null;
  const value = (kpiTargets as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

export function buildExportRow(
  post: ExportPostInput,
): Record<string, string | number | null> {
  const polled = post.last_metric_polled_at != null;

  // Mirror the post detail page (deriveRecordedKpiMetrics) so exported
  // actuals match the recorded metrics users see in the UI.
  const actualEngagement = polled
    ? post.likes + post.shares + post.comment_count
    : null;
  const actualBuzz = polled ? post.comment_count + post.shares : null;
  const actualInteraction = polled
    ? post.likes + post.shares + post.comment_count + post.views
    : null;
  const actualView = polled ? post.views : null;
  const actualComment = polled ? post.comment_count : null;
  const actualShare = polled ? post.shares : null;

  const engagementKpi = readKpi(post.kpi_targets, 'engagement');
  const buzzKpi = readKpi(post.kpi_targets, 'buzz');
  const interactionKpi = readKpi(post.kpi_targets, 'interaction');
  const viewKpi = readKpi(post.kpi_targets, 'view');

  const account =
    post.linkedAccount?.display_name || post.linkedAccount?.username || null;
  const tier = post.linkedAccount?.tierName ?? null;

  return {
    account,
    tier,
    platform: post.platform,
    url: post.url,
    postedDate: formatPostedDate(post.published_at),
    achievedEngagement: computeAchieved(actualEngagement, engagementKpi),
    achievedBuzz: computeAchieved(actualBuzz, buzzKpi),
    achievedInteraction: computeAchieved(actualInteraction, interactionKpi),
    achievedView: computeAchieved(actualView, viewKpi),
    engagementKpi,
    buzzKpi,
    interactionKpi,
    viewKpi,
    actualEngagement,
    actualBuzz,
    actualInteraction,
    actualView,
    actualComment,
    actualShare,
  };
}

export async function buildExportWorkbook(
  rows: Record<string, string | number | null>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Posts');
  sheet.addRow(EXPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(EXPORT_COLUMNS.map((c) => row[c.key] ?? null));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
