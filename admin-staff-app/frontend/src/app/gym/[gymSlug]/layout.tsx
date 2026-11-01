import { notFound } from "next/navigation";
import type { ReactNode } from "react";

const GYM_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function GymTenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ gymSlug: string }>;
}) {
  const { gymSlug } = await params;
  const normalized = gymSlug.trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 64 || !GYM_SLUG_REGEX.test(normalized)) {
    notFound();
  }
  return <>{children}</>;
}
