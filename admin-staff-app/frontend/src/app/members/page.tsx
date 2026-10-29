import type { Metadata } from "next";
import { MembersPage } from "@/components/members-page";

export const metadata: Metadata = {
  title: "Members — GymOS",
  description: "Search and manage your gym's members.",
};

export default function MembersRoute() {
  return <MembersPage />;
}
