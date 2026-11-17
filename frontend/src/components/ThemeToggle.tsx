import { useSyncExternalStore } from 'react'

import { chooseTheme, currentTheme } from '../lib/theme'
import { MoonIcon, SunIcon } from './icons'

/** Re-render when the theme changes, whoever changed it (this button, or the device's setting). */
const watchTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/** One button: switches between the light (cream) and dark themes. */
export const ThemeToggle = () => {
  const theme = useSyncExternalStore(watchTheme, currentTheme)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => chooseTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="flex size-9 items-center justify-center rounded-lg border border-rule text-body transition hover:bg-well hover:text-link"
    >
      {theme === 'dark' ? <SunIcon className="size-[18px]" /> : <MoonIcon className="size-[18px]" />}
    </button>
  )
}
