import { BadRequestException } from '@nestjs/common';
import { Platform } from '../../generated/prisma/client';

export const USERNAME_PATTERNS: Record<Platform, RegExp> = {
  [Platform.FACEBOOK]: /^[A-Za-z0-9.]{3,}$/,
  [Platform.INSTAGRAM]: /^[A-Za-z0-9._]{1,30}$/,
  [Platform.TIKTOK]: /^[A-Za-z0-9._]{2,24}$/,
  [Platform.YOUTUBE]: /^[A-Za-z0-9._-]{1,}$/,
  [Platform.THREADS]: /^[A-Za-z0-9._]{1,30}$/,
};

export function validateUsername(platform: Platform, username: string): void {
  const pattern = USERNAME_PATTERNS[platform];
  if (!username || !pattern.test(username)) {
    throw new BadRequestException(`Invalid ${platform} username: ${username}`);
  }
}
