import { useSyncExternalStore } from 'react'

export type GenerationKind = 'looks' | 'render'

export interface ActiveGeneration {
  id: string
  kind: GenerationKind
  startedAt: number
}

const STORAGE_KEY = 'oul.active-generation'

function isActiveGeneration(value: unknown): value is ActiveGeneration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ActiveGeneration>
  return (
    typeof candidate.id === 'string' &&
    (candidate.kind === 'looks' || candidate.kind === 'render')
  )
}

function read(): ActiveGeneration | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isActiveGeneration(parsed)
      ? { ...parsed, startedAt: parsed.startedAt || Date.now() }
      : null
  } catch {
    return null
  }
}

let current: ActiveGeneration | null = read()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function persist(next: ActiveGeneration | null) {
  current = next
  try {
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Private mode / blocked storage: tracking still works for this page view.
  }
  emit()
}

/**
 * Mark a recommendation as generating outside the page that started it, so
 * polling and progress survive navigation. Persisted so a reload keeps it.
 */
export function trackGeneration(id: string, kind: GenerationKind = 'looks') {
  if (current?.id === id && current.kind === kind) return
  persist({ id, kind, startedAt: Date.now() })
}

export function clearGeneration(id?: string) {
  if (!current) return
  if (id && current.id !== id) return
  persist(null)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useActiveGeneration(): ActiveGeneration | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
}
