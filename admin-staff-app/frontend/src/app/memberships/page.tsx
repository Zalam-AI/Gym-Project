import type { Metadata } from "next";
import { MembershipsPage } from "@/components/memberships-page";

export const metadata: Metadata = {
  title: "Memberships — GymOS",
  description: "Manage membership plans, subscriptions, and renewals.",
};

export default function MembershipsRoute() {
  return <MembershipsPage />;
}
