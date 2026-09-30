import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  serverExternalPackages: ["@node-rs/argon2", "exceljs", "nodemailer", "qrcode", "ioredis", "pg", "@prisma/adapter-pg"],
  experimental: { serverActions: { bodySizeLimit: "256kb" } },
  async headers() {
    // Cabeceras base para TODO (incluye estáticos). La CSP con nonce la añade el middleware.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
