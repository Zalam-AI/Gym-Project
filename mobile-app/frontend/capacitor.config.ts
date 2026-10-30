import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gymos.mobile",
  appName: "GymOS",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
