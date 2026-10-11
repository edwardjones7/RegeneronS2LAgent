import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Outreach was renamed Campaigns; keep old links working.
  async redirects() {
    return [{ source: '/outreach', destination: '/campaigns', permanent: false }];
  },
};

export default nextConfig;
