/**
 * The keys this app owns in localStorage, and the one-time move from the keys it used to own.
 *
 * NovaType was called Blue Type. Renaming the keys without carrying the values across would
 * have thrown away the user's theme, their saved passages and the freshness memory that
 * stops the same fact coming round again — a rename that presents itself as data loss. So
 * each legacy value is copied onto its new key once per page load, before anything reads
 * storage, and the legacy entry is left where it is afterwards: an older build still open in
 * another tab keeps working, and the copy costs a few kilobytes.
 */

export const STORAGE_KEYS = {
  settings: 'novatype.settings.v1',
  recentFacts: 'novatype.recent-facts',
  playedSources: 'novatype.played-sources',
  lastResult: 'novatype.last-result',
} as const

export type StorageKeyName = keyof typeof STORAGE_KEYS

const LEGACY_KEYS: Record<StorageKeyName, string> = {
  settings: 'bluetype.settings.v1',
  recentFacts: 'bluetype.recent-facts',
  playedSources: 'bluetype.played-sources',
  lastResult: 'bluetype.last-result',
}

let migrated = false

/**
 * Copies any legacy value onto its new key.
 *
 * Called from module scope by every module that reads storage while it initialises — the
 * settings store, the fact memory and the source rotation — and guarded so that whichever
 * one loads first does the work and the rest are free.
 */
export function migrateLegacyKeys(): void {
  if (migrated || typeof window === 'undefined') return
  migrated = true

  for (const name of Object.keys(STORAGE_KEYS) as StorageKeyName[]) {
    try {
      const next = STORAGE_KEYS[name]
      // Never overwrite: a value already under the new key is the newer one.
      if (window.localStorage.getItem(next) !== null) continue
      const value = window.localStorage.getItem(LEGACY_KEYS[name])
      if (value !== null) window.localStorage.setItem(next, value)
    } catch {
      // Storage disabled or full. Starting from defaults is the only option left, and the
      // app is fully usable on them.
    }
  }
}
