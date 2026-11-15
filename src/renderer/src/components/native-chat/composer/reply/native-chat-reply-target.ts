// A message the next send replies to, kept per draft scope apart from the draft record so the
// draft schema stays unchanged; small and bounded, so localStorage holds it across reloads.

import { useSyncExternalStore } from 'react'

export type NativeChatReplyTarget = {
  /** Unique per Reply click: a send consumes only the target it captured, never a newer one. */
  readonly id: string
  readonly messageId: string
  readonly author: 'agent' | 'user'
  /** What the strip shows and the quote carries; the agent already holds the full message. */
  readonly excerpt: string
}

/** Quote length: enough to identify the message without resending it. */
export const NATIVE_CHAT_REPLY_EXCERPT_MAX = 500
/** Scopes remembered at once; older targets are dropped first. */
export const NATIVE_CHAT_REPLY_TARGETS_MAX = 30
const STORAGE_KEY = 'orca.nativeChat.replyTargets.v1'

const targets = new Map<string, NativeChatReplyTarget>()
const listeners = new Map<string, Set<() => void>>()
/** Scopes whose last reply the user cancelled, so the strip can say so; a send clears silently. */
const cancelled = new Set<string>()
let loaded = false
let sequence = 0

function isTarget(value: unknown): value is NativeChatReplyTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'messageId' in value &&
    typeof value.messageId === 'string' &&
    'author' in value &&
    (value.author === 'agent' || value.author === 'user') &&
    'excerpt' in value &&
    typeof value.excerpt === 'string'
  )
}

function load(): void {
  if (loaded) {
    return
  }
  loaded = true
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    const entries: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(entries)) {
      return
    }
    for (const entry of entries) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && isTarget(entry[1])) {
        targets.set(entry[0], {
          ...entry[1],
          excerpt: entry[1].excerpt.slice(0, NATIVE_CHAT_REPLY_EXCERPT_MAX + 1)
        })
      }
    }
  } catch {
    // Unreadable or blocked storage only costs the remembered strip, never the draft.
  }
}

function save(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...targets]))
  } catch {
    // Quota or blocked storage: the target still works for this session.
  }
}

function notify(scopeKey: string): void {
  for (const listener of listeners.get(scopeKey) ?? []) {
    listener()
  }
}

/** The message's own words up to the cap: an earlier reply's quote and markdown markers are left out. */
export function nativeChatReplyExcerpt(text: string): string {
  const own = nativeChatReplyQuoteOf(text)?.rest ?? text
  const trimmed = own
    .split(/\r?\n/)
    .filter((line) => !/^\s*(```|~~~)/.test(line))
    .map((line) => line.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+)/, ''))
    .join('\n')
    .trim()
  if (trimmed.length <= NATIVE_CHAT_REPLY_EXCERPT_MAX) {
    return trimmed
  }
  return `${trimmed.slice(0, NATIVE_CHAT_REPLY_EXCERPT_MAX).trimEnd()}…`
}

export function createNativeChatReplyTarget(
  message: Omit<NativeChatReplyTarget, 'id' | 'excerpt'> & { text: string }
): NativeChatReplyTarget {
  sequence += 1
  return {
    id: `${Date.now().toString(36)}-${sequence}`,
    messageId: message.messageId,
    author: message.author,
    excerpt: nativeChatReplyExcerpt(message.text)
  }
}

export function readNativeChatReplyTarget(scopeKey: string): NativeChatReplyTarget | null {
  load()
  return targets.get(scopeKey) ?? null
}

export function setNativeChatReplyTarget(scopeKey: string, target: NativeChatReplyTarget): void {
  load()
  cancelled.delete(scopeKey)
  targets.delete(scopeKey)
  targets.set(scopeKey, target)
  const evicted: string[] = []
  while (targets.size > NATIVE_CHAT_REPLY_TARGETS_MAX) {
    const oldest = targets.keys().next().value
    if (oldest === undefined) {
      break
    }
    targets.delete(oldest)
    evicted.push(oldest)
  }
  save()
  notify(scopeKey)
  // A mounted strip for a dropped scope must not keep showing a reply the send can no longer read.
  for (const key of evicted) {
    notify(key)
  }
}

/** The user dropped the reply (Cancel or Esc); true when there was one. */
export function cancelNativeChatReplyTarget(scopeKey: string): boolean {
  const current = readNativeChatReplyTarget(scopeKey)
  if (!current) {
    return false
  }
  clearNativeChatReplyTarget(scopeKey, current.id)
  cancelled.add(scopeKey)
  return true
}

export function nativeChatReplyWasCancelled(scopeKey: string): boolean {
  return cancelled.has(scopeKey)
}

/** Esc in a message box: drops that box's reply, if it has one, before anything else Esc does there. */
export function cancelNativeChatReplyFrom(target: EventTarget | null): boolean {
  const scopeKey =
    target instanceof Element
      ? target.closest<HTMLElement>('[data-native-chat-composer-scope]')?.dataset
          .nativeChatComposerScope
      : undefined
  return scopeKey ? cancelNativeChatReplyTarget(scopeKey) : false
}

/** Puts back a reply a refused send had taken, unless the user has picked another since. */
export function restoreNativeChatReplyTarget(
  scopeKey: string,
  target: NativeChatReplyTarget
): void {
  if (!readNativeChatReplyTarget(scopeKey)) {
    setNativeChatReplyTarget(scopeKey, target)
  }
}

/** Forgets replies for drafts that are deleted, such as a closed chat or removed workspace. */
export function clearNativeChatReplyTargetsWhere(matches: (scopeKey: string) => boolean): void {
  load()
  const removed = [...targets.keys()].filter(matches)
  if (removed.length === 0) {
    return
  }
  for (const key of removed) {
    targets.delete(key)
  }
  save()
  for (const key of removed) {
    notify(key)
  }
}

/** Clears the scope's target; with `id`, only when it is still that target, so a newer Reply survives a send. */
export function clearNativeChatReplyTarget(scopeKey: string, id?: string): void {
  load()
  const current = targets.get(scopeKey)
  if (!current || (id !== undefined && current.id !== id)) {
    return
  }
  cancelled.delete(scopeKey)
  targets.delete(scopeKey)
  save()
  notify(scopeKey)
}

function subscribe(scopeKey: string, listener: () => void): () => void {
  let set = listeners.get(scopeKey)
  if (!set) {
    set = new Set()
    listeners.set(scopeKey, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) {
      listeners.delete(scopeKey)
    }
  }
}

export function useNativeChatReplyTarget(scopeKey: string): NativeChatReplyTarget | null {
  return useSyncExternalStore(
    (listener) => subscribe(scopeKey, listener),
    () => readNativeChatReplyTarget(scopeKey)
  )
}

const AGENT_HEAD = /^> Replying to the earlier message from (.+):$/
const OWN_HEAD = '> Replying to my earlier message:'

/** The text a reply sends: a quote of the message it answers, written for the agent, then the user's words. */
export function withNativeChatReplyContext(
  text: string,
  target: Pick<NativeChatReplyTarget, 'author' | 'excerpt'> | null,
  agentLabel: string
): string {
  if (!target) {
    return text
  }
  const quoted = target.excerpt
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n')
  const head =
    target.author === 'agent' ? `> Replying to the earlier message from ${agentLabel}:` : OWN_HEAD
  const body = text.trim()
  return body ? `${head}\n${quoted}\n\n${text}` : `${head}\n${quoted}`
}

/** A sent reply's quote, read back so the user's own bubble can show it compactly. */
export function nativeChatReplyQuoteOf(
  text: string
): { author: 'agent' | 'user'; label: string | null; excerpt: string; rest: string } | null {
  // Most messages are not replies; skip the split on every row render.
  if (!text.startsWith('> Replying to ')) {
    return null
  }
  const lines = text.split(/\r?\n/)
  const agentHead = AGENT_HEAD.exec(lines[0] ?? '')
  if (!agentHead && lines[0] !== OWN_HEAD) {
    return null
  }
  let end = 1
  while (end < lines.length && lines[end].startsWith('>')) {
    end += 1
  }
  const excerpt = lines
    .slice(1, end)
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
  return {
    author: agentHead ? 'agent' : 'user',
    label: agentHead?.[1] ?? null,
    excerpt,
    rest: lines.slice(end).join('\n').trim()
  }
}

/** Test-only: forget all targets and reload from storage on next read. */
export function resetNativeChatReplyTargetsForTests(): void {
  targets.clear()
  cancelled.clear()
  listeners.clear()
  loaded = false
}
