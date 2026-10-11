import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The engine reads ../protocols and ../data (shared with voice-agent/) at runtime, by a path
  // the bundler can't trace, so ship them with every server function.
  outputFileTracingRoot: path.join(__dirname, '..'),
  outputFileTracingIncludes: {
    '/**': ['../protocols/*.json', '../data/synthea-nj.json'],
  },
  // Outreach was renamed Campaigns; keep old links working.
  async redirects() {
    return [{ source: '/outreach', destination: '/campaigns', permanent: false }];
  },
};

export default nextConfig;
