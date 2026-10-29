import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GymOS — Member App",
  description: "Your GymOS membership pass, workouts, and attendance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
