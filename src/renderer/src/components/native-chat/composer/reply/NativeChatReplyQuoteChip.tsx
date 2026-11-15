import { Reply } from 'lucide-react'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { nativeChatReplyQuoteOf } from './native-chat-reply-target'

type ReplyQuote = NonNullable<ReturnType<typeof nativeChatReplyQuoteOf>>

function repliedToLabel(quote: ReplyQuote, t: Translate): string {
  return quote.author === 'agent'
    ? t('components.native-chat.reply.repliedTo', 'Replied to {{name}}', {
        name: quote.label ?? ''
      })
    : t('components.native-chat.reply.repliedToYou', 'Replied to your message')
}

const firstLine = (text: string): string => text.split(/\r?\n/).find((line) => line.trim()) ?? ''

/** A sent reply's quote as one line, for places that show plain text such as a queued card. */
export function nativeChatReplyDisplayText(text: string, t: Translate): string {
  const quote = nativeChatReplyQuoteOf(text)
  if (!quote) {
    return text
  }
  const head = `↩ ${repliedToLabel(quote, t)} · ${firstLine(quote.excerpt)}`
  return quote.rest ? `${head}\n${quote.rest}` : head
}

/** The quote the agent received, shown to the user as one compact line above their words. */
export function NativeChatReplyQuoteChip({ quote }: { quote: ReplyQuote }): React.JSX.Element {
  const t = useTranslate()
  return (
    <div
      className="mb-1.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
      title={quote.excerpt}
    >
      <Reply aria-hidden className="size-3 shrink-0" />
      <span className="shrink-0">{repliedToLabel(quote, t)}</span>
      <span aria-hidden>·</span>
      <span className="min-w-0 truncate">{firstLine(quote.excerpt)}</span>
    </div>
  )
}
