import type { Metadata } from "next";
import { PaymentsPage } from "@/components/payments-page";

export const metadata: Metadata = {
  title: "Payments — GymOS",
  description: "Track payments, outstanding balances, and gym receipts.",
};

export default function PaymentsRoute() {
  return <PaymentsPage />;
}
