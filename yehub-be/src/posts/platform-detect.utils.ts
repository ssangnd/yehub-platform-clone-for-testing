import { Platform } from '../../generated/prisma/client';

interface DetectionResult {
  platform: Platform;
  platform_post_id: string;
}

const PATTERNS: {
  platform: Platform;
  regex: RegExp;
  extractId: (match: RegExpMatchArray) => string;
}[] = [
  // Facebook: facebook.com/*/posts/*, facebook.com/watch/*, fb.watch/*,
  //           facebook.com/groups/*/permalink/*, facebook.com/reel/*,
  //           facebook.com/photo/?fbid=*, facebook.com/stories/<author>/<token>,
  //           facebook.com/story.php?story_fbid=*,
  //           facebook.com/share/p/<id>, facebook.com/share/r/<id>,
  //           facebook.com/share/v/<id>,
  //           facebook.com/*/videos/*, facebook.com/permalink.php?story_fbid=*
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/[^/]+\/posts\/(\w+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/groups\/[^/]+\/permalink\/(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/share\/p\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/share\/[rv]\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/permalink\.php\?[^#]*story_fbid=(\w+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/story\.php\?[^#]*story_fbid=(\w+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/reel\/(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/[^/]+\/videos\/(?:[^/]+\/)?(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/stories\/\d+\/([^/?#]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/photo\/?\?fbid=(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/watch\/?\?v=(\w+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /fb\.watch\/(\w+)/i,
    extractId: (m) => m[1],
  },
  // Instagram: instagram.com/p/*, instagram.com/reel/*
  {
    platform: Platform.INSTAGRAM,
    regex: /(?:www\.)?instagram\.com\/(?:p|reel)\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  // TikTok: tiktok.com/@*/video/*, tiktok.com/@*/photo/*,
  //         t.tiktok.com/i18n/share/*, vm.tiktok.com/*, vt.tiktok.com/*
  {
    platform: Platform.TIKTOK,
    regex: /(?:www\.)?tiktok\.com\/@[^/]*\/(?:video|photo)\/(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.TIKTOK,
    regex: /t\.tiktok\.com\/i18n\/share\/(?:video|photo)\/(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.TIKTOK,
    regex: /v[mt]\.tiktok\.com\/([\w]+)/i,
    extractId: (m) => m[1],
  },
  // YouTube: youtube.com/watch?v=*, youtu.be/*, youtube.com/shorts/*
  {
    platform: Platform.YOUTUBE,
    regex: /(?:www\.)?youtube\.com\/watch\?.*v=([\w-]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.YOUTUBE,
    regex: /youtu\.be\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.YOUTUBE,
    regex: /(?:www\.)?youtube\.com\/shorts\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  // Threads: threads.net/@*/post/*, threads.com/@*/post/*
  {
    platform: Platform.THREADS,
    regex: /(?:www\.)?threads\.(?:net|com)\/@[^/]+\/post\/([\w]+)/i,
    extractId: (m) => m[1],
  },
];

export function detectPlatform(url: string): DetectionResult | null {
  for (const pattern of PATTERNS) {
    const match = url.match(pattern.regex);
    if (match) {
      return {
        platform: pattern.platform,
        platform_post_id: pattern.extractId(match),
      };
    }
  }
  return null;
}
