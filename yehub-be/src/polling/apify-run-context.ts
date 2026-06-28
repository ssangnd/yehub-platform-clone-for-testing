import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ApifyRunMeta {
  jobType: string;
  postId?: string;
  campaignId?: string;
  socialAccountId?: string;
}

// Carries the business context (post/campaign/account) of the scrape that is
// currently executing, so ApifyRunRecorder can attribute Apify runs without
// threading ids through every adapter signature.
@Injectable()
export class ApifyRunContext {
  private readonly storage = new AsyncLocalStorage<ApifyRunMeta>();

  run<T>(meta: ApifyRunMeta, fn: () => T): T {
    return this.storage.run(meta, fn);
  }

  get(): ApifyRunMeta | undefined {
    return this.storage.getStore();
  }
}
