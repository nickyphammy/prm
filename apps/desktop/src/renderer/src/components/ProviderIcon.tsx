import type { ProviderId } from '@prm/shared'
import { cn } from '@/lib/utils'

const MARKS: Record<ProviderId, { letter: string; className: string }> = {
  google: { letter: 'G', className: 'bg-[#4285f4]/12 text-[#3b73d9] dark:text-[#8ab4f8]' },
  notion: { letter: 'N', className: 'bg-fg/8 text-fg' },
}

/** Neutral lettermarks; official logos need each vendor's brand approval before the app is sold. */
export function ProviderIcon({
  provider,
  className,
}: {
  provider: ProviderId
  className?: string
}) {
  const mark = MARKS[provider]
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold',
        mark.className,
        className,
      )}
    >
      {mark.letter}
    </span>
  )
}
