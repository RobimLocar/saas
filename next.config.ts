import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.abacus.ai" },
      // Supabase Storage (bucket público de assets)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Permite acesso via URL de preview (dev server host allowlist)
  allowedDevOrigins: ["*"],
};

export default nextConfig;
