import type { Metadata } from "next";
import { PlatformLoginPage } from "@/components/platform-login-page";

export const metadata: Metadata = {
  title: "Platform Console Sign In | GymOS",
};

export default function PlatformLoginRoute() {
  return <PlatformLoginPage />;
}
