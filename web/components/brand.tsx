import Image from "next/image"

import logo from "@/assets/regeneron-logo.png"
import { cn } from "@/lib/utils"

/** Regeneron wordmark (with "Science to Medicine" tagline). Hashed + cached forever by the build. */
export function RegeneronLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src={logo} alt="Regeneron" priority={priority} className={cn("h-7 w-auto select-none", className)} />
}

/** Logo + product name, used in page headers. */
export function BrandLockup({ product = "Call Me Maybe", suffix }: { product?: string; suffix?: string }) {
  return (
    <span className="flex items-center gap-3">
      <RegeneronLogo priority />
      <span className="h-6 w-px bg-border" aria-hidden />
      <span className="text-sm font-semibold tracking-tight">
        {product}
        {suffix && <span className="hidden font-normal text-muted-foreground sm:inline"> / {suffix}</span>}
      </span>
    </span>
  )
}
