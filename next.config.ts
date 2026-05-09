import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.185"],
  serverExternalPackages: ["node-pty"],
  async rewrites() {
    return [
      {
        source: "/api/terminal",
        destination: "http://127.0.0.1:3100",
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
