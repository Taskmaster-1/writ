import type { NextConfig } from "next";

const gateway = process.env.GATEWAY_URL ?? "http://localhost:8790";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // The console and the gateway share one origin, so session cookies and /mcp just work.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${gateway}/api/:path*` },
      { source: "/mcp", destination: `${gateway}/mcp` },
    ];
  },
  experimental: {
    // Calls waiting for approval are held open for up to 4 minutes.
    proxyTimeout: 300_000,
  },
};

export default config;
