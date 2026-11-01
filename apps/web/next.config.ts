import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ["@siterra/contracts", "@siterra/db", "@siterra/domain"],
  // Images are served as they are, so the deployment needs no sharp or libvips (LGPL) binary.
  images: { unoptimized: true },
};

export default nextConfig;
