import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@solana/web3.js"],
  poweredByHeader: false,
};

export default nextConfig;
