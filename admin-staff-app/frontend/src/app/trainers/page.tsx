import type { Metadata } from "next";
import { TrainersPage } from "@/components/trainers-page";

export const metadata: Metadata = {
  title: "Trainers & Workouts — GymOS",
  description: "Manage gym trainers, workout plans, and member assignments.",
};

export default function TrainersRoute() {
  return <TrainersPage />;
}
