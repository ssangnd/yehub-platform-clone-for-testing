import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { systemSettingsApi } from '@/api/system-settings'
import { queryKeys } from '@/lib/constants/query-keys'
import { MAX_IMAGE_BYTES } from '@/lib/constants/uploads'
import { showApiError } from '@/lib/errors'
import { useSystemLogo } from '@/hooks/use-system-logo'
import { useImageCropUpload } from '@/hooks/use-image-crop-upload'

export function useAppearanceTab() {
  const queryClient = useQueryClient()
  const { url, isCustom, isLoading } = useSystemLogo()

  const saveLogoMutation = useMutation({
    mutationFn: (key: string) => systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: key }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.public })
      toast.success('Logo updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to save logo' }),
  })

  const resetLogoMutation = useMutation({
    mutationFn: () => systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.public })
      toast.success('Logo reset to default')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to reset logo' }),
  })

  const { openPicker, hiddenInput, dialog, isUploading } = useImageCropUpload({
    aspect: 'free',
    maxSize: 1024,
    title: 'Crop logo',
    onUploaded: (key) => saveLogoMutation.mutate(key),
  })

  return {
    logoUrl: url,
    hasCustomLogo: isCustom,
    isLoading,
    maxBytes: MAX_IMAGE_BYTES,
    openLogoPicker: openPicker,
    pickerInput: hiddenInput,
    pickerDialog: dialog,
    resetLogo: () => resetLogoMutation.mutate(),
    isUploading: isUploading || saveLogoMutation.isPending,
    isResetting: resetLogoMutation.isPending,
  }
}
