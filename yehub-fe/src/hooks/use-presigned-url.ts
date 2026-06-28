import { useQuery } from '@tanstack/react-query'
import { uploadsApi } from '@/api/uploads'
import { queryKeys } from '@/lib/constants/query-keys'

export function usePresignedUrl(key: string | null | undefined) {
  // Some columns store a fully-qualified public URL rather than a private S3
  // key — e.g. avatars auto-mirrored from a social platform are saved as
  // `http://.../bucket/avatars/...`. Those are served directly and must not be
  // sent to the presign endpoint, which only accepts (and validates) `uploads/`
  // keys and would 400 on an absolute URL, leaving the avatar blank.
  const isAbsoluteUrl = !!key && /^https?:\/\//i.test(key)

  const { data: url, isLoading } = useQuery({
    queryKey: queryKeys.presignedUrl(key!),
    queryFn: () => uploadsApi.getDownloadUrl(key!),
    enabled: !!key && !isAbsoluteUrl,
    staleTime: 5 * 60 * 1000, // 5 minutes — URLs are valid for 24h
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })

  if (isAbsoluteUrl) return { url: key, isLoading: false }
  return { url, isLoading }
}
