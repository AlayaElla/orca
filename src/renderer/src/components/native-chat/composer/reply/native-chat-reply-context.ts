import { useLayoutEffect, type RefObject } from 'react'
import { createNativeChatReplyTarget, setNativeChatReplyTarget } from './native-chat-reply-target'

export type NativeChatReplySource = {
  messageId: string
  author: 'agent' | 'user'
  text: string
}

/** The chat's message box: the last composer in its root, below any queued-message editors. */
function nativeChatMainComposer(from: Element | null): HTMLElement | null {
  const composers = from
    ?.closest('[data-native-chat-root]')
    ?.querySelectorAll<HTMLElement>('[data-native-chat-composer-scope]')
  return composers ? ([...composers].at(-1) ?? null) : null
}

/** Points the chat's message box at `source` and hands the user back to typing there. */
export function startNativeChatReply(from: Element | null, source: NativeChatReplySource): void {
  const composer = nativeChatMainComposer(from)
  const scopeKey = composer?.dataset.nativeChatComposerScope
  if (!composer || !scopeKey) {
    return
  }
  setNativeChatReplyTarget(scopeKey, createNativeChatReplyTarget(source))
  composer.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus()
}

/** A message jump the transcript answers when it holds that message; `found` reports whether it did. */
const REVEAL_MESSAGE_EVENT = 'native-chat:reveal-message'
/** Fired on the chat root when the transcript's messages change, so availability is asked again. */
export const NATIVE_CHAT_MESSAGES_CHANGED_EVENT = 'native-chat:messages-changed'
type RevealMessageDetail = { messageId: string; probe: boolean; found: boolean }

/** With `probe`, only asks whether the transcript holds the message. */
export function requestNativeChatMessageReveal(
  from: Element | null,
  messageId: string,
  probe: boolean
): boolean {
  const root = from?.closest('[data-native-chat-root]')
  if (!root) {
    return false
  }
  const detail: RevealMessageDetail = { messageId, probe, found: false }
  root.dispatchEvent(new CustomEvent(REVEAL_MESSAGE_EVENT, { detail }))
  if (detail.found && !probe) {
    markNativeChatRevealedMessage(root, messageId)
  }
  return detail.found
}

const LANDED_MS = 1500
const LANDING_FRAMES = 60

/** Once the jumped-to row is drawn: outline it briefly and move focus there, so keyboard and screen-reader users land too. */
function markNativeChatRevealedMessage(root: Element, messageId: string, frame = 0): void {
  const row = root.querySelector<HTMLElement>(
    `[data-native-chat-message-id="${CSS.escape(messageId)}"]`
  )
  if (!row) {
    if (frame < LANDING_FRAMES) {
      requestAnimationFrame(() => markNativeChatRevealedMessage(root, messageId, frame + 1))
    }
    return
  }
  row.setAttribute('data-native-chat-reply-landed', '')
  if (!row.hasAttribute('tabindex')) {
    row.tabIndex = -1
  }
  row.focus({ preventScroll: true })
  setTimeout(() => row.removeAttribute('data-native-chat-reply-landed'), LANDED_MS)
}

/** The transcript's side: answers reveal requests in its chat. Layout-time, so a strip's
 *  passive probe on the same commit already finds it. */
export function useNativeChatMessageRevealAnswer(
  scrollRef: RefObject<HTMLElement | null>,
  reveal: ((messageId: string, probe: boolean) => boolean) | null
): void {
  useLayoutEffect(() => {
    const root = scrollRef.current?.closest('[data-native-chat-root]')
    if (!root || !reveal) {
      return
    }
    const onReveal = (event: Event): void => {
      const detail: RevealMessageDetail | undefined =
        event instanceof CustomEvent ? event.detail : undefined
      if (detail && !detail.found) {
        detail.found = reveal(detail.messageId, detail.probe)
      }
    }
    root.addEventListener(REVEAL_MESSAGE_EVENT, onReveal)
    // `reveal` changes with the transcript's messages; anything showing availability asks again.
    root.dispatchEvent(new Event(NATIVE_CHAT_MESSAGES_CHANGED_EVENT))
    return () => root.removeEventListener(REVEAL_MESSAGE_EVENT, onReveal)
  }, [reveal, scrollRef])
}
