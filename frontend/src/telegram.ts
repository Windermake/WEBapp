export interface TelegramUser {
  id?: number
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramThemeParams {
  bg_color?: string
  secondary_bg_color?: string
  text_color?: string
  hint_color?: string
  button_color?: string
  button_text_color?: string
}

export interface TelegramWebApp {
  initDataUnsafe?: {
    user?: TelegramUser
  }
  themeParams?: TelegramThemeParams
  ready: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  }
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}

function applyThemeVariables(themeParams?: TelegramThemeParams) {
  if (!themeParams) {
    return
  }

  const root = document.documentElement

  if (themeParams.button_color) {
    root.style.setProperty('--telegram-accent', themeParams.button_color)
  }
  if (themeParams.button_text_color) {
    root.style.setProperty('--telegram-accent-text', themeParams.button_text_color)
  }
  if (themeParams.secondary_bg_color) {
    root.style.setProperty('--telegram-surface', themeParams.secondary_bg_color)
  }
  if (themeParams.text_color) {
    root.style.setProperty('--telegram-text', themeParams.text_color)
  }
  if (themeParams.hint_color) {
    root.style.setProperty('--telegram-hint', themeParams.hint_color)
  }
  if (themeParams.bg_color) {
    root.style.setProperty('--telegram-bg', themeParams.bg_color)
  }
}

export function setupTelegramApp(): TelegramWebApp | null {
  const webApp = window.Telegram?.WebApp

  if (!webApp) {
    return null
  }

  applyThemeVariables(webApp.themeParams)
  webApp.ready()
  webApp.expand?.()
  webApp.disableVerticalSwipes?.()

  try {
    webApp.setHeaderColor?.('#1a1024')
    webApp.setBackgroundColor?.('#110916')
  } catch {
    // Ignore color API mismatches between Telegram versions.
  }

  return webApp
}

export function getTelegramDisplayName(webApp: TelegramWebApp | null): string {
  const user = webApp?.initDataUnsafe?.user

  if (user?.first_name) {
    return user.first_name
  }

  if (user?.username) {
    return `@${user.username}`
  }

  return 'Локальный игрок'
}
