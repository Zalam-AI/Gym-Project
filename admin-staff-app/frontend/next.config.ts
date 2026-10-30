import type { NextConfig } from "next";

const isPreviewMode = process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(!isPreviewMode
    ? [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: isPreviewMode
    ? ["*.e2b.app", "*.localhost", "localhost", "127.0.0.1"]
    : ["*.localhost", "localhost", "127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  webpack(config, { nextRuntime, webpack }) {
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.EnvironmentPlugin({
          GYMOS_SESSION_SECRET: "",
          GYMOS_ALLOW_PREVIEW_ORIGINS: "",
          GYMOS_STAFF_APP_ORIGINS: "",
          GYMOS_MEMBER_APP_ORIGINS: "",
          GYMOS_BASE_DOMAIN: "",
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
