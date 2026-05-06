import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
