import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const terminalPort = process.env.TERMINAL_PORT ?? "3100";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.185"],
  serverExternalPackages: ["node-pty"],
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api/terminal",
        destination: `http://127.0.0.1:${terminalPort}/api/terminal`,
      },
      {
        source: "/api/terminal/:path*",
        destination: `http://127.0.0.1:${terminalPort}/api/terminal/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
