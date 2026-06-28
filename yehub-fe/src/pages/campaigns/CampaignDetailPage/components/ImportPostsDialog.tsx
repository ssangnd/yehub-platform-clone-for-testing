import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { postsApi, type BulkUploadResult } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { ChevronDown, Upload, X } from 'lucide-react'

const CSV_TEMPLATE_URL = '/templates/posts-template.csv'
const XLSX_TEMPLATE_URL = '/templates/posts-template.xlsx'

function downloadTemplate(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

interface ImportPostsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
}

export function ImportPostsDialog({ open, onOpenChange, campaignId }: ImportPostsDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<BulkUploadResult | null>(null)
  const [uploadPct, setUploadPct] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      abortRef.current?.abort()
      abortRef.current = null
      setFile(null)
      setResult(null)
      setUploadPct(0)
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: () => {
      setUploadPct(0)
      const controller = new AbortController()
      abortRef.current = controller
      return postsApi.bulkUploadPosts(campaignId, file!, {
        onUploadProgress: setUploadPct,
        signal: controller.signal,
      })
    },
    onSuccess: (response) => {
      const data = response.data
      setResult(data)
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      const message = `Imported ${data.success_count} of ${data.total} posts`
      if (data.success_count < data.total) {
        toast.warning(message)
      } else {
        toast.success(message)
      }
    },
    onError: (err) => {
      if (axios.isCancel(err)) return
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Upload failed')
      }
    },
    onSettled: () => {
      abortRef.current = null
    },
  })

  const isUploading = mutation.isPending
  const uploadLabel = uploadPct < 100 ? `Uploading… ${uploadPct}%` : 'Processing…'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col">
        <DialogHeader>
          <DialogTitle>Import posts</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with URLs and optional KPI targets. Max 500 rows.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground cursor-pointer">
                Download template
                <ChevronDown className="ml-1 h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => downloadTemplate(XLSX_TEMPLATE_URL, 'posts-template.xlsx')}>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadTemplate(CSV_TEMPLATE_URL, 'posts-template.csv')}>
                  CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!file ? (
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-muted/50">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Click to select a CSV or Excel file</span>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm truncate">{file.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFile(null)
                    setUploadPct(0)
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {isUploading && (
              <div className="space-y-1">
                <Progress value={uploadPct < 100 ? uploadPct : 100} />
                <div className="text-xs text-muted-foreground">{uploadLabel}</div>
              </div>
            )}

            <Button className="w-full cursor-pointer" disabled={!file || isUploading} onClick={() => mutation.mutate()}>
              Upload
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{result.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold text-green-600">{result.success_count}</div>
                <div className="text-xs text-muted-foreground">Success</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold text-red-600">{result.failed_count}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
            {result.failures.length > 0 && (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {result.failures.map((f, i) => (
                  <div key={i} className="text-xs flex flex-col rounded-lg border p-3 gap-1">
                    <Button
                      onClick={() => {
                        window.open(f.url, '_blank', 'noopener,noreferrer')
                      }}
                      variant="link"
                      className="font-mono break-all! whitespace-normal! h-fit text-left w-full p-0 justify-start"
                    >
                      {f.url}
                    </Button>
                    <span className="text-red-500">{f.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full cursor-pointer" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
