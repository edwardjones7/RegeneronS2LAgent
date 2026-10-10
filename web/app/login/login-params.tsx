"use client"

import { useSearch } from "@/hooks/use-url"

/** Carries ?next= through the sign-in post and shows the wrong-password message. */
export function LoginParams() {
  const q = new URLSearchParams(useSearch())
  const n = q.get("next")
  const next = n?.startsWith("/dashboard") ? n : "/dashboard"
  return (
    <>
      <input type="hidden" name="next" value={next} />
      {q.has("error") && (
        <p role="alert" className="text-sm text-destructive">
          That password didn&apos;t work. Try again.
        </p>
      )}
    </>
  )
}
