import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = {
  title: "Register — GymOS",
  description: "Create a GymOS staff account with an invitation code.",
};

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
