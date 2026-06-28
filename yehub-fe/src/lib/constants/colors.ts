export const COLOR_PRESETS = {
  red: { label: 'Red', swatch: 'bg-red-500', badge: 'bg-red-500/10 text-red-500' },
  orange: { label: 'Orange', swatch: 'bg-orange-500', badge: 'bg-orange-500/10 text-orange-500' },
  amber: { label: 'Amber', swatch: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-500' },
  green: { label: 'Green', swatch: 'bg-green-500', badge: 'bg-green-500/10 text-green-500' },
  teal: { label: 'Teal', swatch: 'bg-teal-500', badge: 'bg-teal-500/10 text-teal-500' },
  blue: { label: 'Blue', swatch: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-500' },
  indigo: { label: 'Indigo', swatch: 'bg-indigo-500', badge: 'bg-indigo-500/10 text-indigo-500' },
  purple: { label: 'Purple', swatch: 'bg-purple-500', badge: 'bg-purple-500/10 text-purple-500' },
  pink: { label: 'Pink', swatch: 'bg-pink-500', badge: 'bg-pink-500/10 text-pink-500' },
  gray: { label: 'Gray', swatch: 'bg-gray-500', badge: 'bg-gray-500/10 text-gray-500' },
} as const

export type ColorKey = keyof typeof COLOR_PRESETS
