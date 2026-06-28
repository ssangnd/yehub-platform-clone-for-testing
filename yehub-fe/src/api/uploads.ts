import { apiClient } from './client'

interface PresignedUploadResponse {
  uploadUrl: string
  key: string
}

interface PresignedDownloadResponse {
  downloadUrl: string
}

export const uploadsApi = {
  requestUploadUrl: async (contentType: string, fileName: string): Promise<PresignedUploadResponse> => {
    const r = await apiClient.post<PresignedUploadResponse>('/uploads/presigned-url', {
      contentType,
      fileName,
    })
    return r.data
  },

  uploadToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
  },

  getDownloadUrl: async (key: string): Promise<string> => {
    const r = await apiClient.get<PresignedDownloadResponse>('/uploads/presigned-url', {
      params: { key },
    })
    return r.data.downloadUrl
  },
}
