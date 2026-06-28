import { Module } from '@nestjs/common';
import { PollingModule } from './polling.module';
import { UploadsCoreModule } from '../uploads/uploads-core.module';
import { PollingRunner } from './polling-runner.service';
import { AccountPollingRunner } from './account-polling-runner.service';
import { ScraperProcessor } from './scraper.processor';
import { PollingDispatchProcessor } from './polling-dispatch.processor';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { TikTokAdapter } from './adapters/tiktok.adapter';
import { YouTubeAdapter } from './adapters/youtube.adapter';
import { ThreadsAdapter } from './adapters/threads.adapter';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { ScraperProxyClient } from './scraper-proxy.client';
import { ApifyClient } from './apify.client';
import { ApifyRunContext } from './apify-run-context';
import { ApifyRunRecorder } from './apify-run.recorder';
import { ApifyUsageRefresher } from './apify-usage-refresher';

// Worker-only host for the BullMQ processors and everything that actually
// executes a scrape: the Apify clients and platform adapters (which read the
// APIFY_* config) plus S3 uploads for scraped media. Imports PollingModule for
// the queue registrations the dispatch processor enqueues to.
@Module({
  imports: [PollingModule, UploadsCoreModule],
  providers: [
    ScraperProxyClient,
    ApifyRunContext,
    ApifyRunRecorder,
    ApifyClient,
    ApifyUsageRefresher,
    FacebookAdapter,
    InstagramAdapter,
    TikTokAdapter,
    YouTubeAdapter,
    ThreadsAdapter,
    PlatformAdapterRegistry,
    PollingRunner,
    AccountPollingRunner,
    ScraperProcessor,
    PollingDispatchProcessor,
  ],
})
export class PollingProcessorModule {}
