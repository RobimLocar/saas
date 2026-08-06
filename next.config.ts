import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.abacus.ai" },
      // Supabase Storage (bucket público de assets)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Permite acesso via URL de preview (dev server host allowlist)
  allowedDevOrigins: [
    "281f3287b.na115.preview.abacusai.app",
    "*.preview.abacusai.app",
    "*.abacusai.app",
  ],
};

export default withNextIntl(nextConfig);
