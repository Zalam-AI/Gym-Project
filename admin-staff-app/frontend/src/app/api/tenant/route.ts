import { NextResponse } from "next/server";
import { getConfiguredBaseDomain } from "@/lib/tenant-domain";
import {
  resolveGymFromRequestHost,
  serializePublicTenantBranding,
} from "@/lib/tenant-resolver";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const resolved = await resolveGymFromRequestHost(request);
    const baseDomain = getConfiguredBaseDomain();

    if (resolved.mode === "neutral") {
      return NextResponse.json({
        mode: "neutral",
        hostname: resolved.host.hostname,
        baseDomain,
        gym: null,
        tenant: null,
      });
    }

    if (resolved.mode === "not-found") {
      return NextResponse.json(
        {
          mode: "not-found",
          hostname: resolved.host.hostname,
          baseDomain,
          gym: null,
          tenant: null,
          error: "No gym workspace exists at this address.",
        },
        { status: 404 },
      );
    }

    const brandingPayload = {
      ...serializePublicTenantBranding(resolved.gym),
      address: resolved.gym.address,
    };

    if (resolved.gym.status !== "active") {
      return NextResponse.json(
        {
          mode: "suspended",
          hostname: resolved.host.hostname,
          baseDomain,
          resolvedBy: resolved.host.kind === "custom-domain" ? "custom-domain" : "subdomain",
          gym: brandingPayload,
          tenant: brandingPayload,
          error:
            resolved.gym.status === "pending"
              ? "This gym workspace is awaiting platform administrator approval."
              : "This gym workspace is currently suspended.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      mode: "tenant",
      hostname: resolved.host.hostname,
      baseDomain,
      resolvedBy: resolved.host.kind === "custom-domain" ? "custom-domain" : "subdomain",
      gym: brandingPayload,
      tenant: brandingPayload,
    });
  } catch (error) {
    console.error("Failed to resolve tenant branding:", error);
    return NextResponse.json(
      { error: "Unable to load gym workspace details right now." },
      { status: 503 },
    );
  }
}
