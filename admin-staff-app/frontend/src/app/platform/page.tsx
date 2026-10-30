import type { Metadata } from "next";
import { PlatformDashboardPage } from "@/components/platform-dashboard-page";

export const metadata: Metadata = {
  title: "Platform Control Plane | GymOS",
};

export default function PlatformDashboardRoute() {
  return <PlatformDashboardPage />;
}
