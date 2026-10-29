import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = {
  title: "Sign in — GymOS",
  description: "Sign in to the GymOS staff workspace.",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
