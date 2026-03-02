import type { ListingTags } from "./types"

interface StoreEntry {
  tags: ListingTags
  el: HTMLElement
}

type Listener = () => void

const store = new Map<string, StoreEntry>()
const listeners: Listener[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function notify(): void {
  if (debounceTimer) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    for (const fn of listeners) fn()
  }, 50)
}

export function setTags(id: string, tags: ListingTags, el: HTMLElement): void {
  store.set(id, { tags, el })
  notify()
}

export function getEntry(id: string): StoreEntry | undefined {
  return store.get(id)
}

export function getAllEntries(): Map<string, StoreEntry> {
  return store
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}
