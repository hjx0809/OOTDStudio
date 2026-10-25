const TOKEN_KEY = 'oul.access_token'

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // Storage can be unavailable in private mode. The in-memory session
      // still works until reload.
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      // no-op
    }
  },
}

export const UNAUTHORIZED_EVENT = 'oul:unauthorized'
