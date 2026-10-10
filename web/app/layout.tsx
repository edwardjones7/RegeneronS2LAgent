import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })

export const metadata: Metadata = {
  title: "Call Me Maybe · Coordinator",
  description: "Speed-to-lead outreach for clinical-trial research teams",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: "#fafbfc", colorScheme: "light" }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-svh">{children}</body>
    </html>
  )
}
