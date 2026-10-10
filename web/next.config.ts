import type { NextConfig } from "next"

// Built as a static export and served by the FastAPI backend at /dashboard (same origin,
// so the session cookie just works). In `next dev`, API calls are proxied to the backend.
const isDev = process.env.NODE_ENV === "development"
const backend = process.env.BACKEND_URL ?? "http://localhost:8000"

const nextConfig: NextConfig = {
  basePath: "/dashboard",
  output: isDev ? undefined : "export",
  distDir: isDev ? ".next" : "out",
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { optimizePackageImports: ["lucide-react", "motion"] },
  ...(isDev && {
    async rewrites() {
      return ["/campaigns/:path*", "/campaigns", "/leads/:path*", "/demo", "/dashboard/logout"].map(
        (source) => ({ source, destination: `${backend}${source}`, basePath: false as const })
      )
    },
  }),
}

export default nextConfig
