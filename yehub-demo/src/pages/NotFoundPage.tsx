import { useNavigate } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <FileQuestion className="h-16 w-16 text-muted-foreground mx-auto" />
        <div className="space-y-2">
          <h1 className="text-4xl font-bold font-mono">404</h1>
          <p className="text-lg text-muted-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground max-w-md">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Button className="cursor-pointer" onClick={() => navigate(ROUTES.DASHBOARD)}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}
