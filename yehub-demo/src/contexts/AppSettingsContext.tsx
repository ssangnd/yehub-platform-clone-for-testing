import { createContext, useContext, useState, type ReactNode } from 'react'

const ALL_PROFILE_CATEGORIES = [
  'Beauty', 'Tech', 'Food', 'Fashion', 'Travel',
  'Fitness', 'Entertainment', 'Education', 'Gaming', 'Lifestyle',
]

interface AppSettings {
  logoUrl: string | null
  visibleProfileCategories: string[]
}

interface AppSettingsContextValue extends AppSettings {
  setLogoUrl: (url: string | null) => void
  setVisibleProfileCategories: (categories: string[]) => void
  allProfileCategories: string[]
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [visibleProfileCategories, setVisibleProfileCategories] = useState<string[]>(ALL_PROFILE_CATEGORIES)

  return (
    <AppSettingsContext.Provider value={{
      logoUrl,
      visibleProfileCategories,
      setLogoUrl,
      setVisibleProfileCategories,
      allProfileCategories: ALL_PROFILE_CATEGORIES,
    }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider')
  return ctx
}
