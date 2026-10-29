import type { Metadata } from "next";
import { AttendancePage } from "@/components/attendance-page";

export const metadata: Metadata = {
  title: "Attendance — GymOS",
  description: "Verify memberships and manage today's gym check-ins.",
};

export default function AttendanceRoute() {
  return <AttendancePage />;
}
