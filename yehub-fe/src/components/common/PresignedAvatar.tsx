import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
import { cn } from '@/lib/utils'

interface PresignedAvatarProps {
  imageKey: string | null | undefined
  alt?: string
  fallback: string
  className?: string
}

export function PresignedAvatar({ imageKey, alt, fallback, className }: PresignedAvatarProps) {
  const { url } = usePresignedUrl(imageKey)

  return (
    <Avatar className={cn('size-8', className)}>
      <AvatarImage src={url} alt={alt} />
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
