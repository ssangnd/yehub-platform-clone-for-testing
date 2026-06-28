import { z } from 'zod'
import type { PlatformType } from '@/api/profiles'
import { parseSocialInput } from '@/lib/social-accounts'
import { FIELD_LIMITS, optionalPhoneSchema } from '@/lib/schemas'

export const SOCIAL_PLATFORMS: { key: PlatformType; label: string; placeholder: string }[] = [
  { key: 'FACEBOOK', label: 'Facebook URL or username', placeholder: 'https://facebook.com/username' },
  { key: 'INSTAGRAM', label: 'Instagram URL or username', placeholder: 'https://instagram.com/username' },
  { key: 'TIKTOK', label: 'TikTok URL or username', placeholder: 'https://tiktok.com/@username' },
  { key: 'YOUTUBE', label: 'YouTube URL or handle', placeholder: 'https://youtube.com/@channel' },
  { key: 'THREADS', label: 'Threads URL or username', placeholder: 'https://threads.net/@username' },
]

const socialUrlsSchema = z.object({
  FACEBOOK: z.string(),
  INSTAGRAM: z.string(),
  TIKTOK: z.string(),
  YOUTUBE: z.string(),
  THREADS: z.string(),
})

export const addProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(FIELD_LIMITS.profile.name.min, 'Name is required')
      .max(FIELD_LIMITS.profile.name.max, `Name must be at most ${FIELD_LIMITS.profile.name.max} characters`),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { message: 'Gender is required' }),
    categoryIds: z.array(z.string()).min(1, 'Select at least one category'),
    tierId: z.string().min(1, 'Tier is required'),
    email: z
      .string()
      .optional()
      .refine((v) => !v || z.email().safeParse(v).success, 'Invalid email'),
    phone: optionalPhoneSchema.optional(),
    avatar: z.string().optional(),
    tagsInput: z.string().optional(),
    socialUrls: socialUrlsSchema,
  })
  .superRefine((data, ctx) => {
    for (const { key } of SOCIAL_PLATFORMS) {
      const raw = (data.socialUrls[key] ?? '').trim()
      if (!raw) continue
      const parsed = parseSocialInput(key, raw)
      if (!parsed.ok) {
        ctx.addIssue({ code: 'custom', path: ['socialUrls', key], message: parsed.error ?? 'Invalid' })
      }
    }
  })

export type AddProfileFormValues = z.infer<typeof addProfileSchema>

export const emptyAddProfileForm: AddProfileFormValues = {
  name: '',
  gender: 'OTHER',
  categoryIds: [],
  tierId: '',
  email: '',
  phone: '',
  avatar: '',
  tagsInput: '',
  socialUrls: { FACEBOOK: '', INSTAGRAM: '', TIKTOK: '', YOUTUBE: '', THREADS: '' },
}
