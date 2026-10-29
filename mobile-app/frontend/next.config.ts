import type { NextConfig } from "next";

const adminBackendOrigin =
  process.env.GYMOS_ADMIN_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ??
  "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${adminBackendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
