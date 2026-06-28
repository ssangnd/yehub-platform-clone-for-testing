import { createContext, useContext, useEffect } from 'react'

export const PageTitleContext = createContext<{
  title: string
  setTitle: (title: string) => void
}>({ title: '', setTitle: () => {} })

export function useSetPageTitle(title: string) {
  const { setTitle } = useContext(PageTitleContext)
  useEffect(() => {
    setTitle(title)
  }, [title, setTitle])
}
