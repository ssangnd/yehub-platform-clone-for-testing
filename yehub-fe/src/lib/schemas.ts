import { z } from 'zod'

export const POLLING_INTERVAL_MIN_SECONDS = 60
export const POLLING_INTERVAL_MAX_SECONDS = 604800

// 0 means manual (no recurring interval); any other value must fall within the recurring range.
export const pollingIntervalSchema = z
  .number()
  .int()
  .refine(
    (v) => v === 0 || (v >= POLLING_INTERVAL_MIN_SECONDS && v <= POLLING_INTERVAL_MAX_SECONDS),
    `Interval must be 0 (manual) or between ${POLLING_INTERVAL_MIN_SECONDS} and ${POLLING_INTERVAL_MAX_SECONDS} seconds`,
  )

export const FIELD_LIMITS = {
  password: { min: 8, max: 128 },
  project: {
    name: { min: 2, max: 100 },
    clientName: { max: 100 },
    description: { max: 500 },
  },
  campaign: { name: { min: 1, max: 200 }, description: { max: 2000 } },
  kolCategory: { name: { min: 1, max: 100 } },
  kolTier: { name: { min: 1, max: 100 } },
  profile: { name: { min: 1, max: 200 } },
} as const

const passwordSchema = z
  .string()
  .min(FIELD_LIMITS.password.min, `Password must be at least ${FIELD_LIMITS.password.min} characters`)
  .max(FIELD_LIMITS.password.max, `Password must be at most ${FIELD_LIMITS.password.max} characters`)
  .refine((v) => v.trim().length > 0, 'Password cannot be only whitespace')

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1, 'Password is required'),
})

export const acceptInvitationSchema = z
  .object({
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export const inviteUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email(),
  role: z.enum(['ADMIN', 'INTERNAL_USER', 'AUTHORIZED_USER']),
})

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email(),
})

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').pipe(z.email()),
})

export const resetPasswordSchema = z
  .object({
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export type LoginFormValues = z.infer<typeof loginSchema>
export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>
export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export const projectFormSchema = z.object({
  name: z
    .string()
    .min(FIELD_LIMITS.project.name.min, `Project name must be at least ${FIELD_LIMITS.project.name.min} characters`)
    .max(FIELD_LIMITS.project.name.max, `Project name must be at most ${FIELD_LIMITS.project.name.max} characters`),
  client_name: z
    .string()
    .max(
      FIELD_LIMITS.project.clientName.max,
      `Client name must be at most ${FIELD_LIMITS.project.clientName.max} characters`,
    )
    .optional(),
  description: z
    .string()
    .max(
      FIELD_LIMITS.project.description.max,
      `Description must be at most ${FIELD_LIMITS.project.description.max} characters`,
    )
    .optional(),
  logo: z.string().optional(),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
})
export type ProjectFormValues = z.infer<typeof projectFormSchema>

export const campaignFormSchema = z
  .object({
    name: z
      .string()
      .min(FIELD_LIMITS.campaign.name.min, 'Campaign name is required')
      .max(
        FIELD_LIMITS.campaign.name.max,
        `Campaign name must be at most ${FIELD_LIMITS.campaign.name.max} characters`,
      ),
    description: z
      .string()
      .max(
        FIELD_LIMITS.campaign.description.max,
        `Description must be at most ${FIELD_LIMITS.campaign.description.max} characters`,
      )
      .optional(),
    platforms: z.array(z.string()).min(1, 'At least one platform is required'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    metric_polling_interval: pollingIntervalSchema.optional(),
    comments_polling_interval: pollingIntervalSchema.optional(),
    display_metrics: z.array(z.string()).optional(),
    objectives: z.array(z.object({ id: z.string(), name: z.string() })),
  })
  .refine(
    (data) => {
      return new Date(data.start_date) < new Date(data.end_date)
    },
    {
      message: 'Start date must be before end date',
      path: ['end_date'],
    },
  )
export type CampaignFormValues = z.infer<typeof campaignFormSchema>

export const addPostSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
})
export type AddPostFormValues = z.infer<typeof addPostSchema>

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(FIELD_LIMITS.kolCategory.name.min, 'Category name is required')
    .max(
      FIELD_LIMITS.kolCategory.name.max,
      `Category name must be at most ${FIELD_LIMITS.kolCategory.name.max} characters`,
    ),
  description: z.string().optional(),
  color: z.string().min(1),
})
export type CategoryFormValues = z.infer<typeof categoryFormSchema>

// Accepts an empty string OR an international phone with 7–15 digits and
// optional `+`, spaces, dashes, dots, parentheses (no digit-counter helper
// needed at runtime — the lookahead in the regex enforces the digit count).
const PHONE_REGEX = /^(?:\+?(?=(?:\D*\d){7,15}\D*$)[0-9 \-.()]+)?$/
const PHONE_ERROR = 'Invalid phone number. Use 7–15 digits with optional country code (e.g. +84 912 345 678).'

export const optionalPhoneSchema = z.string().refine((v) => PHONE_REGEX.test(v.trim()), PHONE_ERROR)

export const profileEditFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(FIELD_LIMITS.profile.name.min, 'Name is required')
    .max(FIELD_LIMITS.profile.name.max, `Name must be at most ${FIELD_LIMITS.profile.name.max} characters`),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { message: 'Gender is required' }),
  categoryIds: z.array(z.string()).min(1, 'Select at least one category'),
  tierId: z.string().min(1, 'Tier is required'),
  email: z.string().refine((v) => !v || z.email().safeParse(v).success, 'Invalid email'),
  phone: optionalPhoneSchema,
  avatar: z.string(),
  tagsInput: z.string(),
})
export type ProfileEditFormValues = z.infer<typeof profileEditFormSchema>

export const profilesFilterSchema = z.object({
  categoryIds: z.array(z.string()),
  tierIds: z.array(z.string()),
  platforms: z.array(z.string()),
  genders: z.array(z.string()),
  tags: z.array(z.string()),
})
export type ProfilesFilterValues = z.infer<typeof profilesFilterSchema>

export const tierFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(FIELD_LIMITS.kolTier.name.min, 'Tier name is required')
      .max(FIELD_LIMITS.kolTier.name.max, `Tier name must be at most ${FIELD_LIMITS.kolTier.name.max} characters`),
    description: z.string().optional(),
    color: z.string().min(1),
    minFollowers: z
      .string()
      .min(1, 'Minimum followers is required')
      .refine((v) => /^\d+$/.test(v), 'Must be a non-negative integer'),
    maxFollowers: z
      .string()
      .optional()
      .refine((v) => !v || /^[1-9]\d*$/.test(v), 'Must be a positive integer'),
  })
  .refine((d) => !d.maxFollowers || Number(d.maxFollowers) > Number(d.minFollowers), {
    message: 'Max followers must be greater than min',
    path: ['maxFollowers'],
  })
export type TierFormValues = z.infer<typeof tierFormSchema>
