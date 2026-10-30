import type { NextConfig } from "next";

const isStaticExport = process.env.GYMOS_MOBILE_EXPORT === "1";
const isPreviewMode = process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1";

const publicApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const proxyApiOrigin = (
  process.env.GYMOS_API_INTERNAL_URL ??
  process.env.GYMOS_ADMIN_INTERNAL_URL ??
  publicApiBaseUrl
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

if (isStaticExport && process.env.NODE_ENV === "production" && !publicApiBaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is required when exporting the production mobile app (e.g. NEXT_PUBLIC_API_BASE_URL=https://your-service.onrender.com npm run export:member).",
  );
}

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
      ...(isPreviewMode ? { allowedDevOrigins: ["*.e2b.app"] } : {}),
      async headers() {
        return [
          {
            source: "/:path*",
            headers: securityHeaders,
          },
        ];
      },
      ...(proxyApiOrigin
        ? {
            async rewrites() {
              return [
                {
                  source: "/api/:path*",
                  destination: `${proxyApiOrigin}/api/:path*`,
                },
              ];
            },
          }
        : {}),
    };

export default nextConfig;
