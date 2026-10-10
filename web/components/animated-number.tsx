"use client"

import { animate, useReducedMotion } from "motion/react"
import { useEffect, useRef } from "react"

/** Counts up to `value` on first render and eases between later values. */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const fmt = useRef(format)
  const reduce = useReducedMotion()
  useEffect(() => {
    fmt.current = format
  })
  useEffect(() => {
    const format = fmt.current
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = format(value)
      from.current = value
      return
    }
    const controls = animate(from.current, value, {
      duration: from.current === 0 ? 0.9 : 0.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => (el.textContent = format(n)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return (
    <span ref={ref} className="tabular">
      {format(reduce ? value : 0)}
    </span>
  )
}
