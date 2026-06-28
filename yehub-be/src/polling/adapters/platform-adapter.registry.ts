import { Injectable } from '@nestjs/common';
import { Platform } from '../../../generated/prisma/client';
import { FacebookAdapter } from './facebook.adapter';
import { InstagramAdapter } from './instagram.adapter';
import { TikTokAdapter } from './tiktok.adapter';
import { YouTubeAdapter } from './youtube.adapter';
import { ThreadsAdapter } from './threads.adapter';
import { PlatformAdapter } from './platform-adapter.interface';
import { PlatformError, PlatformErrorCode } from '../platform-error';

@Injectable()
export class PlatformAdapterRegistry {
  private readonly adapters: Map<Platform, PlatformAdapter>;

  constructor(
    facebook: FacebookAdapter,
    instagram: InstagramAdapter,
    tiktok: TikTokAdapter,
    youtube: YouTubeAdapter,
    threads: ThreadsAdapter,
  ) {
    this.adapters = new Map(
      [facebook, instagram, tiktok, youtube, threads].map((adapter) => [
        adapter.platform,
        adapter,
      ]),
    );
  }

  get(platform: Platform): PlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new PlatformError(
        PlatformErrorCode.UNKNOWN,
        `No adapter registered for ${platform}`,
      );
    }
    return adapter;
  }
}
