export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** In-memory storage for tests and any environment without a real localStorage. */
export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

/** Returns window.localStorage when running in a browser, null otherwise
    (SSR, tests that don't opt into a DOM). Callers should fall back to
    createMemoryStorage() when this returns null. */
export function getBrowserStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}
