import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gymos.mobile",
  appName: "GymOS",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
