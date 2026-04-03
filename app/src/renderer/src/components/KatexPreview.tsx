import { useEffect, useRef } from 'react'
import katex from 'katex'

interface Props {
  latex: string
  display?: boolean
  className?: string
}

export default function KatexPreview({ latex, display = false, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!ref.current) return
    katex.render(latex, ref.current, { throwOnError: false, displayMode: display })
  }, [latex, display])

  return <span ref={ref} className={className} />
}
