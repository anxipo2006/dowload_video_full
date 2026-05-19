import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ép Next.js bỏ qua lỗi TypeScript khi build trên server
    ignoreBuildErrors: true,
  },
};

export default nextConfig;