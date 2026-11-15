// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_REPLY_TARGETS_MAX,
  readNativeChatReplyTarget,
  resetNativeChatReplyTargetsForTests,
  nativeChatReplyExcerpt,
  nativeChatReplyQuoteOf,
  setNativeChatReplyTarget,
  useNativeChatReplyTarget,
  withNativeChatReplyContext
} from './native-chat-reply-target'
import { readNativeChatContextMenuTarget } from '../../pane/actions/native-chat-context-menu-target'
import { useNativeChatMessageRevealAnswer } from './native-chat-reply-context'
import { NativeChatReplyStrip } from './NativeChatReplyStrip'
import { deleteNativeChatComposerDraft } from '../../drafts/native-chat-composer-draft-removal'
import { clearNativeChatComposerDraftsForTests } from '../../drafts/native-chat-draft-reset'

const reply = (id: string, messageId = 'm-1') => ({
  id,
  messageId,
  author: 'agent' as const,
  excerpt: 'Updated the three cards.'
})

beforeEach(() => {
  localStorage.clear()
  resetNativeChatReplyTargetsForTests()
  clearNativeChatComposerDraftsForTests()
})
afterEach(() => cleanup())

describe('reply targets', () => {
  it('tells a mounted chat when its reply is dropped to make room for newer ones', () => {
    setNativeChatReplyTarget('scope-old', reply('old'))
    const mounted = renderHook(() => useNativeChatReplyTarget('scope-old'))
    expect(mounted.result.current?.id).toBe('old')
    act(() => {
      for (let index = 0; index < NATIVE_CHAT_REPLY_TARGETS_MAX; index += 1) {
        setNativeChatReplyTarget(`scope-${index}`, reply(`r-${index}`))
      }
    })
    expect(mounted.result.current).toBeNull()
    expect(readNativeChatReplyTarget('scope-old')).toBeNull()
  })

  it('forgets a reply when its chat draft is deleted', () => {
    setNativeChatReplyTarget('agent-session:gone', reply('r'))
    setNativeChatReplyTarget('agent-session:kept', reply('k'))
    deleteNativeChatComposerDraft('agent-session:gone')
    expect(readNativeChatReplyTarget('agent-session:gone')).toBeNull()
    expect(readNativeChatReplyTarget('agent-session:kept')?.id).toBe('k')
  })
})

function Chat({
  messages,
  pickerOpen = false
}: {
  messages: readonly string[]
  pickerOpen?: boolean
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  useNativeChatMessageRevealAnswer(scrollRef, (id) => messages.includes(id))
  return (
    <div data-native-chat-root="true">
      <div ref={scrollRef}>
        {messages.map((id) => (
          <div key={id} data-native-chat-message-id={id}>
            {id}
          </div>
        ))}
      </div>
      <div data-native-chat-composer-scope="scope">
        <NativeChatReplyStrip scopeKey="scope" agent="claude" onDone={() => {}} />
        <div contentEditable aria-expanded={pickerOpen} data-testid="input" />
      </div>
    </div>
  )
}

describe('reply strip', () => {
  it('follows the original as the transcript loses and regains it', () => {
    setNativeChatReplyTarget('scope', reply('r', 'm-7'))
    const view = render(<Chat messages={['m-7']} />)
    expect(screen.queryByText('Message unavailable')).toBeNull()
    view.rerender(<Chat messages={[]} />)
    expect(screen.getByText('Message unavailable')).toBeTruthy()
    view.rerender(<Chat messages={['m-7']} />)
    expect(screen.queryByText('Message unavailable')).toBeNull()
  })

  it('lets an open picker take Esc first, then Esc cancels the reply and says so', () => {
    setNativeChatReplyTarget('scope', reply('r', 'm-7'))
    const view = render(<Chat messages={['m-7']} pickerOpen />)
    expect(screen.getByRole('status').textContent).toBe('Replying to Claude')
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Escape' })
    expect(readNativeChatReplyTarget('scope')?.id).toBe('r')
    view.rerender(<Chat messages={['m-7']} />)
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Escape' })
    expect(readNativeChatReplyTarget('scope')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Reply cancelled')
  })

  it('outlines and focuses the original it jumps to', () => {
    setNativeChatReplyTarget('scope', reply('r', 'm-7'))
    render(<Chat messages={['m-7']} />)
    fireEvent.click(screen.getByRole('button', { name: /Show the original message/ }))
    const row = screen.getByText('m-7')
    expect(row.hasAttribute('data-native-chat-reply-landed')).toBe(true)
    expect(document.activeElement).toBe(row)
  })
})

describe('reply quotes', () => {
  it('reads a sent reply back for the compact line and keeps only its own words for a new excerpt', () => {
    const sent = withNativeChatReplyContext(
      'Why blue?',
      { author: 'agent', excerpt: 'Updated the cards.' },
      'Claude'
    )
    expect(nativeChatReplyQuoteOf(sent)).toEqual({
      author: 'agent',
      label: 'Claude',
      excerpt: 'Updated the cards.',
      rest: 'Why blue?'
    })
    expect(nativeChatReplyExcerpt(sent)).toBe('Why blue?')
    expect(nativeChatReplyExcerpt('## Plan\n```ts\nconst a = 1\n```')).toBe('Plan\nconst a = 1')
  })

  it('offers no Reply for a message inside a subagent view', () => {
    const view = document.createElement('div')
    view.setAttribute('data-native-chat-subagent-view', 'agent-1')
    const row = document.createElement('div')
    row.setAttribute('data-native-chat-message-id', 'm-1')
    row.setAttribute('data-native-chat-message-author', 'agent')
    view.append(row)
    document.body.append(view)
    const target = readNativeChatContextMenuTarget(row, {
      root: view,
      composer: null,
      messageList: { messageCopyText: () => 'words' },
      linkContext: null
    })
    expect(target.replyTo).toBeNull()
    view.remove()
  })
})
