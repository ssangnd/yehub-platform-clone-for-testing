export const JOB_TYPE_LABELS: Record<string, string> = {
  'poll-post-metrics': 'Post metrics',
  'poll-post-comments': 'Post comments',
  'poll-social-account': 'Account profile',
}

export function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType
}
