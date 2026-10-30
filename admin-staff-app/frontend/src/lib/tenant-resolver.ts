import { Types } from "mongoose";
import { subdomainifyGymName } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import {
  deriveGymInitials,
  getConfiguredBaseDomain,
  type ParsedTenantHost,
  parseTenantHost,
} from "@/lib/tenant-domain";

export type ResolvedTenantGym = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subdomain: string;
  customDomain: string;
  address: string;
  status: "pending" | "active" | "suspended";
  branding: {
    accentColor: string;
    tagline: string;
    logoText: string;
  };
};

export type TenantHostLookupResult =
  | { mode: "neutral"; host: ParsedTenantHost; gym: null }
  | { mode: "tenant"; host: ParsedTenantHost; gym: ResolvedTenantGym }
  | { mode: "not-found"; host: ParsedTenantHost; gym: null };

type RawGymTenantDoc = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
  address?: string;
  status?: string;
  branding?: {
    accentColor?: string;
    tagline?: string;
    logoText?: string;
  } | null;
};

function normalizeTenantDoc(doc: RawGymTenantDoc): ResolvedTenantGym {
  const accent =
    doc.branding?.accentColor && /^#[0-9a-fA-F]{6}$/.test(doc.branding.accentColor)
      ? doc.branding.accentColor
      : "#45b58b";
  const tagline = doc.branding?.tagline?.trim() || doc.address?.trim() || "";
  const logoText = deriveGymInitials(doc.name, doc.branding?.logoText);

  return {
    _id: doc._id,
    name: doc.name,
    slug: doc.slug,
    subdomain: doc.subdomain?.trim().toLowerCase() || subdomainifyGymName(doc.name),
    customDomain: doc.customDomain?.trim().toLowerCase() || "",
    address: doc.address ?? "",
    status:
      doc.status === "suspended"
        ? "suspended"
        : doc.status === "pending"
          ? "pending"
          : "active",
    branding: {
      accentColor: accent,
      tagline,
      logoText,
    },
  };
}

export async function resolveGymForHost(
  parsedHost: ParsedTenantHost,
): Promise<TenantHostLookupResult> {
  if (parsedHost.kind === "neutral") {
    return { mode: "neutral", host: parsedHost, gym: null };
  }
  if (parsedHost.kind === "invalid-host") {
    return { mode: "not-found", host: parsedHost, gym: null };
  }

  await connectToDatabase();

  if (parsedHost.kind === "subdomain") {
    const label = parsedHost.subdomain.toLowerCase();
    const directMatch = await GymModel.findOne({
      $or: [{ subdomain: label }, { slug: label }],
    })
      .select("name slug subdomain customDomain address status branding")
      .lean<RawGymTenantDoc | null>();

    if (directMatch) {
      return { mode: "tenant", host: parsedHost, gym: normalizeTenantDoc(directMatch) };
    }

    // Legacy fallback: match a pre-existing gym whose hyphenated slug compacts to `label`
    // (e.g. slug "iron-house" -> "ironhouse") when unambiguous.
    if (!label.includes("-")) {
      const candidates = await GymModel.find({
        $or: [{ subdomain: { $exists: false } }, { subdomain: null }, { subdomain: "" }],
      })
        .select("name slug subdomain customDomain address status branding")
        .lean<RawGymTenantDoc[]>();

      const matches = candidates.filter(
        (item) => item.slug.toLowerCase().replace(/-/g, "") === label,
      );
      if (matches.length === 1) {
        return { mode: "tenant", host: parsedHost, gym: normalizeTenantDoc(matches[0]) };
      }
    }

    return { mode: "not-found", host: parsedHost, gym: null };
  }

  // Custom domain lookup
  const customMatch = await GymModel.findOne({
    customDomain: parsedHost.customDomain.toLowerCase(),
  })
    .select("name slug subdomain customDomain address status branding")
    .lean<RawGymTenantDoc | null>();

  if (!customMatch) {
    return { mode: "not-found", host: parsedHost, gym: null };
  }

  return { mode: "tenant", host: parsedHost, gym: normalizeTenantDoc(customMatch) };
}

export async function resolveGymFromRequestHost(
  request: Request,
): Promise<TenantHostLookupResult> {
  return resolveGymForHost(parseTenantHost(request));
}

export function serializePublicTenantBranding(gym: ResolvedTenantGym) {
  const baseDomain = getConfiguredBaseDomain();
  return {
    name: gym.name,
    slug: gym.slug,
    subdomain: gym.subdomain,
    subdomainUrl: `https://${gym.subdomain}.${baseDomain}`,
    customDomain: gym.customDomain || null,
    branding: gym.branding,
  };
}
