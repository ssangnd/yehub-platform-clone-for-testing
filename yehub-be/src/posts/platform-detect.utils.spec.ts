import { Platform } from '../../generated/prisma/client';
import { detectPlatform } from './platform-detect.utils';

describe('detectPlatform', () => {
  it('detects Facebook story links after share post redirects', () => {
    expect(
      detectPlatform(
        'https://www.facebook.com/story.php?story_fbid=1460005019493826&id=100064530256741&mibextid=wwXIfr',
      ),
    ).toEqual({
      platform: Platform.FACEBOOK,
      platform_post_id: '1460005019493826',
    });
  });

  it('detects Facebook reel share links and their video redirects', () => {
    expect(
      detectPlatform(
        'https://www.facebook.com/share/r/18wCAPndkY/?mibextid=wwXIfr',
      ),
    ).toEqual({
      platform: Platform.FACEBOOK,
      platform_post_id: '18wCAPndkY',
    });

    expect(
      detectPlatform(
        'https://www.facebook.com/hhsb.vn/videos/top-phai-top-phai/1477869813512523/?share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F18wCAPndkY%2F',
      ),
    ).toEqual({
      platform: Platform.FACEBOOK,
      platform_post_id: '1477869813512523',
    });
  });

  it('detects Facebook video share links before redirect resolution', () => {
    expect(
      detectPlatform('https://www.facebook.com/share/v/1S3vC9KZ9q/'),
    ).toEqual({
      platform: Platform.FACEBOOK,
      platform_post_id: '1S3vC9KZ9q',
    });
  });

  it('detects vt.tiktok.com short links as TikTok posts', () => {
    expect(detectPlatform('https://vt.tiktok.com/ZSxGJycFj/')).toEqual({
      platform: Platform.TIKTOK,
      platform_post_id: 'ZSxGJycFj',
    });
  });

  it('detects TikTok photo links after short URL redirects', () => {
    expect(
      detectPlatform(
        'https://www.tiktok.com/@thch.nh.vy6/photo/7641968605348777234?_r=1&_t=ZS-96mebob0bkD',
      ),
    ).toEqual({
      platform: Platform.TIKTOK,
      platform_post_id: '7641968605348777234',
    });
  });

  it('detects TikTok i18n share video redirect links', () => {
    expect(
      detectPlatform(
        'https://t.tiktok.com/i18n/share/video/7642266160544730389/?_t=ZS-96medzP4Dsz',
      ),
    ).toEqual({
      platform: Platform.TIKTOK,
      platform_post_id: '7642266160544730389',
    });
  });

  it('detects TikTok video links with an empty username segment', () => {
    expect(
      detectPlatform(
        'https://www.tiktok.com/@/video/7642266160544730389/?_r=1&_t=ZS-96medzP4Dsz',
      ),
    ).toEqual({
      platform: Platform.TIKTOK,
      platform_post_id: '7642266160544730389',
    });
  });
});
