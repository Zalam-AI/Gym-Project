import type { NextConfig } from "next";

const isStaticExport = process.env.GYMOS_MOBILE_EXPORT === "1";
const isPreviewMode = process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1";

const apiInternalOrigin = (
  process.env.GYMOS_API_INTERNAL_URL ??
  process.env.GYMOS_ADMIN_INTERNAL_URL ??
  "http://127.0.0.1:3000"
).replace(/\/+$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(!isPreviewMode
    ? [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ]
    : []),
];

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      images: {
        unoptimized: true,
      },
    }
  : {
      allowedDevOrigins: isPreviewMode
        ? ["*.e2b.app", "localhost", "127.0.0.1"]
        : ["localhost", "127.0.0.1"],
      async headers() {
        return [
          {
            source: "/:path*",
            headers: securityHeaders,
          },
        ];
      },
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: `${apiInternalOrigin}/api/:path*`,
          },
        ];
      },
    };

export default nextConfig;
