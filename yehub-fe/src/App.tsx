import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppErrorBoundary } from '@/components/common/AppErrorBoundary'
import { router } from './router'

const queryClient = new QueryClient()

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
