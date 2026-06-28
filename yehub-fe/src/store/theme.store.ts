import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

// Apply stored theme immediately to avoid flash
;(() => {
  try {
    const raw = localStorage.getItem('yehub-theme')
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: string } }
      if (parsed?.state?.theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
    }
  } catch {
    // ignore parse errors
  }
})()

interface ThemeStore {
  theme: Theme
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
    }),
    {
      name: 'yehub-theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)
