import type { Project } from '@/api/projects'
import { usePresignedUrl } from '@/hooks/use-presigned-url'

export function ProjectLogo({ project, size = 9 }: { project: Project; size?: number }) {
  const { url: logoUrl } = usePresignedUrl(project.logo)
  const sizeClass = `size-${size}`
  return (
    <div
      className={`${sizeClass} shrink-0 rounded-lg border bg-muted overflow-hidden flex items-center justify-center`}
    >
      {project.logo ? (
        <img src={logoUrl} alt={project.client_name ?? project.name} className="size-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {(project.client_name ?? project.name).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
