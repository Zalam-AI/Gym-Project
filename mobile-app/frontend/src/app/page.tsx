import type { Metadata } from "next";
import { MemberApp } from "@/components/member-app";

export const metadata: Metadata = {
  title: "Member App Preview — GymOS",
  description: "Preview the GymOS member experience.",
};

export default function MemberAppRoute() {
  return <MemberApp />;
}
