import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { PlatformError } from './platform-error';
import type { AccountPollingJobData } from './account-polling.service';
import { ApifyRunContext } from './apify-run-context';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';

@Injectable()
export class AccountPollingRunner {
  private readonly logger = new Logger(AccountPollingRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: PlatformAdapterRegistry,
    private readonly uploads: UploadsService,
    private readonly runContext: ApifyRunContext,
  ) {}

  async process(job: Job<AccountPollingJobData>): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: job.data.socialAccountId },
      include: { profile: { select: { id: true, avatar: true } } },
    });
    if (!account) {
      this.logger.debug(
        `Account poll no-op, account missing socialAccountId=${job.data.socialAccountId}`,
      );
      return;
    }

    if (!account.username) {
      // No handle to scrape by; retrying cannot fix this.
      this.logger.warn(
        `Account poll failed, no username socialAccountId=${account.id}`,
      );
      await this.markStatus(account.id, 'failed');
      return;
    }

    const username = account.username;

    try {
      const adapter = this.adapters.get(account.platform);
      // Attribute any Apify run triggered by the adapter to this account.
      const data = await this.runContext.run(
        {
          jobType: POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
          socialAccountId: account.id,
        },
        () => adapter.fetchAccountProfile(username),
      );

      if (
        data.platformUserId &&
        data.platformUserId !== account.platform_user_id
      ) {
        const owner = await this.prisma.socialAccount.findFirst({
          where: {
            platform: account.platform,
            platform_user_id: data.platformUserId,
            id: { not: account.id },
          },
          select: { id: true },
        });
        if (owner) {
          // The real platform id already belongs to another account. Leave
          // both untouched; the user resolves via move/unlink. No throw —
          // BullMQ retries cannot resolve a data conflict.
          this.logger.warn(
            `Account poll conflict socialAccountId=${account.id} platformUserId=${data.platformUserId} ownerId=${owner.id}`,
          );
          await this.markStatus(account.id, 'conflict');
          return;
        }
      }

      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          platform_user_id: data.platformUserId || account.platform_user_id,
          username: data.username ?? account.username,
          display_name: data.displayName ?? account.display_name,
          follower_count: data.followerCount,
          is_verified: data.isVerified,
          last_polled_at: new Date(),
          last_poll_status: 'success',
        },
      });

      // Avatar is only ever filled when empty (never overwritten). Each skip
      // path below is logged so a "success" poll without an applied avatar can
      // be diagnosed from the logs instead of guessing between the three gates.
      if (!data.avatarUrl) {
        this.logger.debug(
          `Account poll: no avatarUrl from adapter socialAccountId=${account.id}`,
        );
      } else if (account.profile.avatar) {
        this.logger.debug(
          `Account poll: profile already has avatar, skipping socialAccountId=${account.id}`,
        );
      } else {
        const mirrored = await this.uploads.mirrorRemoteImage(
          data.avatarUrl,
          `avatars/profiles/${account.profile.id}`,
        );
        if (mirrored) {
          await this.prisma.profile.update({
            where: { id: account.profile.id },
            data: { avatar: mirrored },
          });
          this.logger.debug(
            `Account poll: applied avatar socialAccountId=${account.id} profileId=${account.profile.id}`,
          );
        } else {
          this.logger.warn(
            `Account poll: avatar mirror failed url=${data.avatarUrl} socialAccountId=${account.id}`,
          );
        }
      }
    } catch (err) {
      await this.markStatus(account.id, 'failed');
      this.logger.error(
        `Account poll failed socialAccountId=${account.id} code=${
          err instanceof PlatformError ? err.code : 'UNKNOWN'
        }: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      throw err;
    }
  }

  private async markStatus(accountId: string, status: string): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { last_polled_at: new Date(), last_poll_status: status },
    });
  }
}
