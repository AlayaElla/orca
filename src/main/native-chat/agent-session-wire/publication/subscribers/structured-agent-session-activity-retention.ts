export const MAX_RETAINED_SESSIONS = 512

/** Keeps each session's latest ephemeral value, dropping the least recently set past the cap. */
export function rememberLatestPerSession<T>(
  bySession: Map<string, T>,
  sessionId: string,
  value: T
): void {
  bySession.delete(sessionId)
  bySession.set(sessionId, value)
  while (bySession.size > MAX_RETAINED_SESSIONS) {
    const oldest = bySession.keys().next()
    if (oldest.done || oldest.value === sessionId) {
      break
    }
    bySession.delete(oldest.value)
  }
}
