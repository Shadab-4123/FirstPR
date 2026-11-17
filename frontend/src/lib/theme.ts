// Light or dark. Until someone picks one, the site follows their device's setting.
// index.html applies the theme before the page draws, so it never flashes the wrong one.

export type Theme = 'light' | 'dark'

const KEY = 'firstpr-theme'

/** The browser bar on phones takes the page's colour. */
const BAR_COLOURS: Record<Theme, string> = { light: '#faf6ee', dark: '#16140f' }

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOURS[theme])
}

/** A choice made with the toggle: applied now and remembered for next time. */
export const chooseTheme = (theme: Theme) => {
  applyTheme(theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
}
