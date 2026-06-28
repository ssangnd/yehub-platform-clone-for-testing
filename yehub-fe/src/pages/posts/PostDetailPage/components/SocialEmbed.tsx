import { useEffect, useRef, useState } from 'react'
import { FacebookEmbed, TikTokEmbed, YouTubeEmbed } from 'react-social-media-embed'
import type { Platform } from '@/api/posts'

interface SocialEmbedProps {
  platform: Platform
  url: string
}

const FACEBOOK_REEL_WIDTH = 267
const FACEBOOK_REEL_HEIGHT = 591
const FACEBOOK_REEL_VIDEO_HEIGHT = 476
const FACEBOOK_PAGE_VIDEO_WIDTH = 500

function getFacebookPageVideoEmbedHref(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return null
    const videoMatch = parsed.pathname.match(/^\/([^/]+)\/videos\/(?:[^/]+\/)?(\d+)\/?$/i)
    if (!videoMatch) return null
    return `https://www.facebook.com/${videoMatch[1]}/videos/${videoMatch[2]}`
  } catch {
    return null
  }
}

function isFacebookReelUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return false
    if (/^\/(?:reel|share\/[rv])\/[^/]+\/?$/i.test(parsed.pathname)) return true
    const shareUrl = parsed.searchParams.get('share_url')
    if (!shareUrl) return false
    const parsedShareUrl = new URL(shareUrl)
    return (
      /(^|\.)facebook\.com$/i.test(parsedShareUrl.hostname) &&
      /^\/share\/[rv]\/[^/]+\/?$/i.test(parsedShareUrl.pathname)
    )
  } catch {
    return false
  }
}

function getFacebookReelEmbedHref(url: string): string {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return url
    const reelMatch = parsed.pathname.match(/^\/reel\/(\d+)\/?$/i)
    if (reelMatch) return `https://www.facebook.com/reel/${reelMatch[1]}`

    const videoMatch = parsed.pathname.match(/^\/([^/]+)\/videos\/(?:[^/]+\/)?(\d+)\/?$/i)
    const shareUrl = parsed.searchParams.get('share_url')
    if (!videoMatch || !shareUrl) return url

    const parsedShareUrl = new URL(shareUrl)
    if (
      /(^|\.)facebook\.com$/i.test(parsedShareUrl.hostname) &&
      /^\/share\/[rv]\/[^/]+\/?$/i.test(parsedShareUrl.pathname)
    ) {
      return `https://www.facebook.com/${videoMatch[1]}/videos/${videoMatch[2]}`
    }
  } catch {
    return url
  }

  return url
}

function buildFacebookReelEmbedUrl(url: string): string {
  const embedUrl = new URL('https://www.facebook.com/plugins/video.php')
  embedUrl.searchParams.set('height', String(FACEBOOK_REEL_VIDEO_HEIGHT))
  embedUrl.searchParams.set('href', getFacebookReelEmbedHref(url))
  embedUrl.searchParams.set('show_text', 'true')
  embedUrl.searchParams.set('width', String(FACEBOOK_REEL_WIDTH))
  embedUrl.searchParams.set('t', '0')
  return embedUrl.toString()
}

const SRCDOC = (blockquote: string, scriptSrc: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html,body{margin:0;width:100%;overflow:hidden}
    .instagram-media,.text-post-media{box-sizing:border-box;margin-left:auto!important;margin-right:auto!important;max-width:100%!important;min-width:0!important;width:calc(100% - 2px)!important}
    iframe.instagram-media,iframe.text-post-media,body>iframe,.fb-video,.fb-video span,.fb-video iframe{box-sizing:border-box;max-width:100%!important;min-width:0!important;width:100%!important}
  </style>
</head>
<body>
${blockquote}
<script async src="${scriptSrc}"></script>
<script>
  new ResizeObserver(function(entries) {
    var h = entries[0].target.scrollHeight;
    window.parent.postMessage({ type: 'embed-resize', height: h }, '*');
  }).observe(document.body);
</script>
</body>
</html>`

function IframeEmbed({
  url,
  scriptSrc,
  blockquote,
  maxWidth,
  title,
}: {
  url: string
  scriptSrc: string
  blockquote: string
  maxWidth: number
  title: string
}) {
  const [height, setHeight] = useState(400)
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'embed-resize' && e.source === iframeRef.current?.contentWindow) {
        setHeight(e.data.height + 20)
        setLoading(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [url])

  return (
    <div className="w-full min-w-0" style={{ maxWidth }}>
      {loading && (
        <div className="animate-pulse rounded-lg border bg-muted/50" style={{ height: 400 }}>
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-sm">Loading embed...</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={SRCDOC(blockquote, scriptSrc)}
        className={`w-full border-0 ${loading ? 'h-0 overflow-hidden' : ''}`}
        style={loading ? undefined : { height }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        title={title}
      />
    </div>
  )
}

function InstagramEmbed({ url }: { url: string }) {
  return (
    <IframeEmbed
      url={url}
      scriptSrc="https://www.instagram.com/embed.js"
      blockquote={`<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14" style="background:#FFF;border:0;border-radius:3px;box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15);margin:1px;max-width:1080px;min-width:0;padding:0;width:calc(100% - 2px);"></blockquote>`}
      maxWidth={1080}
      title="Instagram post"
    />
  )
}

function ThreadsEmbed({ url }: { url: string }) {
  return (
    <IframeEmbed
      url={url}
      scriptSrc="https://www.threads.net/embed.js"
      blockquote={`<blockquote class="text-post-media" data-text-post-permalink="${url}" data-text-post-version="0"></blockquote>`}
      maxWidth={1080}
      title="Threads post"
    />
  )
}

function FacebookReelEmbed({ url }: { url: string }) {
  return (
    <div
      className="w-full min-w-0"
      style={{
        maxWidth: FACEBOOK_REEL_WIDTH,
        aspectRatio: `${FACEBOOK_REEL_WIDTH} / ${FACEBOOK_REEL_HEIGHT}`,
      }}
    >
      <iframe
        src={buildFacebookReelEmbedUrl(url)}
        width="100%"
        height="100%"
        className="h-full w-full border-0"
        style={{ overflow: 'hidden' }}
        scrolling="no"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        title="Facebook reel"
      />
    </div>
  )
}

function FacebookPageVideoEmbed({ url }: { url: string }) {
  return (
    <IframeEmbed
      url={url}
      scriptSrc="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v3.2"
      blockquote={`<div id="fb-root"></div><div class="fb-video" data-href="${url}" data-width="${FACEBOOK_PAGE_VIDEO_WIDTH}" data-show-text="false"><div class="fb-xfbml-parse-ignore"><blockquote cite="${url}"><a href="${url}">View on Facebook</a></blockquote></div></div>`}
      maxWidth={FACEBOOK_PAGE_VIDEO_WIDTH}
      title="Facebook video"
    />
  )
}

export function SocialEmbed({ platform, url }: SocialEmbedProps) {
  switch (platform) {
    case 'YOUTUBE':
      return <YouTubeEmbed url={url} width="100%" />
    case 'TIKTOK':
      return <TikTokEmbed url={url} />
    case 'INSTAGRAM':
      return <InstagramEmbed url={url} />
    case 'FACEBOOK':
      {
        const pageVideoUrl = getFacebookPageVideoEmbedHref(url)
        if (pageVideoUrl) return <FacebookPageVideoEmbed url={pageVideoUrl} />
      }
      if (isFacebookReelUrl(url)) return <FacebookReelEmbed url={url} />
      return <FacebookEmbed url={url} width="100%" />
    case 'THREADS':
      return <ThreadsEmbed url={url} />
    default:
      return null
  }
}
