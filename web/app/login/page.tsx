import type { Metadata } from "next"
import { Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { LoginParams } from "./login-params"

export const metadata: Metadata = { title: "Sign in · Call Me Maybe" }

// Static page; the form posts to the FastAPI backend, which sets the session cookie.
export default function LoginPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.95_0.03_262),transparent)] px-4">
      <div className="w-full max-w-sm animate-in duration-500 fade-in slide-in-from-bottom-2">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-[oklch(0.55_0.2_262)] to-[oklch(0.45_0.18_270)] text-white shadow-sm">
            <Phone className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Call Me Maybe</span>
        </div>
        <Card className="shadow-[0_8px_32px_-12px_rgba(16,24,40,0.12)]">
          <CardHeader>
            <CardTitle className="text-lg">Coordinator sign in</CardTitle>
            <CardDescription>See every lead, call and booking in real time.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" action="/dashboard/login" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
              </div>
              <LoginParams />
              <Button type="submit" className="h-10 w-full">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
