import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  webpack(config, { nextRuntime, webpack }) {
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.EnvironmentPlugin({
          GYMOS_SESSION_SECRET: "",
          GYMOS_ALLOW_PREVIEW_ORIGINS: "",
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
