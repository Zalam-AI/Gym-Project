import { headers } from "next/headers";
import { Dashboard } from "@/components/dashboard";
import { PlatformDashboardPage } from "@/components/platform-dashboard-page";
import { parseHostnameAsTenant } from "@/lib/tenant-domain";

export default async function Home() {
  const hdrs = await headers();
  const rawHost = hdrs.get("x-forwarded-host") || hdrs.get("host") || "";
  const parsedHost = parseHostnameAsTenant(rawHost);

  // Subdomain-ready: when accessed on `<slug>.leelooconnect.com` / `<slug>.gymos.com`,
  // `/` serves that gym's isolated workspace dashboard.
  if (parsedHost.kind !== "neutral") {
    return <Dashboard />;
  }

  // On the primary platform host (`/`), render the Leeloo Connect Super Admin Dashboard.
  return <PlatformDashboardPage />;
}
