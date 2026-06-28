import { Platform } from '../../generated/prisma/client';
import { cleanPostUrl } from './url-clean.utils';

describe('cleanPostUrl', () => {
  it('strips all tracking params for a path-identity platform (TikTok)', () => {
    const url =
      'https://www.tiktok.com/@user/video/123?_r=1&_t=ZS-abc&is_from_webapp=1&sender_device=pc&web_id=999';
    expect(cleanPostUrl(url, Platform.TIKTOK)).toBe(
      'https://www.tiktok.com/@user/video/123',
    );
  });

  it('strips utm_* and misc tracking params for Instagram', () => {
    const url =
      'https://www.instagram.com/p/AbC123/?utm_source=ig_web&xmt=foo&slof=bar';
    expect(cleanPostUrl(url, Platform.INSTAGRAM)).toBe(
      'https://www.instagram.com/p/AbC123/',
    );
  });

  it('keeps only "v" for YouTube and drops the rest', () => {
    const url =
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123&utm_source=share';
    expect(cleanPostUrl(url, Platform.YOUTUBE)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('keeps fbid for Facebook photo URLs', () => {
    const url = 'https://www.facebook.com/photo/?fbid=12345&set=a.999&__tn__=x';
    expect(cleanPostUrl(url, Platform.FACEBOOK)).toBe(
      'https://www.facebook.com/photo/?fbid=12345',
    );
  });

  it('keeps story_fbid for Facebook permalink URLs', () => {
    const url =
      'https://www.facebook.com/permalink.php?story_fbid=678&id=42&mibextid=zz';
    expect(cleanPostUrl(url, Platform.FACEBOOK)).toBe(
      'https://www.facebook.com/permalink.php?story_fbid=678',
    );
  });

  it('strips the URL fragment', () => {
    const url = 'https://www.facebook.com/share/p/AbC123/?utm_source=x#_=_';
    expect(cleanPostUrl(url, Platform.FACEBOOK)).toBe(
      'https://www.facebook.com/share/p/AbC123/',
    );
  });

  it('is a no-op on an already-clean canonical URL', () => {
    const url = 'https://www.facebook.com/user/videos/123';
    expect(cleanPostUrl(url, Platform.FACEBOOK)).toBe(url);
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(cleanPostUrl('not a url', Platform.TIKTOK)).toBe('not a url');
  });
});
