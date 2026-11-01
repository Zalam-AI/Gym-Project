import { Types } from "mongoose";
import { subdomainifyGymName } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import {
  computeSubscriptionState,
  type RawPlatformSubscription,
} from "gymos-admin-backend/lib/saas-enforcement";
import GymModel from "gymos-admin-backend/models/gym";
import { parseGymWorkspacePath } from "@/lib/gym-routing";
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
  accessAllowed: boolean;
  accessDeniedReason: string | null;
  branding: {
    accentColor: string;
    tagline: string;
    logoText: string;
  };
};

export type TenantResolutionSource = "subdomain" | "custom-domain" | "path";

export type TenantHostLookupResult =
  | { mode: "neutral"; host: ParsedTenantHost; resolvedBy: null; gym: null }
  | {
      mode: "tenant";
      host: ParsedTenantHost;
      resolvedBy: TenantResolutionSource;
      gym: ResolvedTenantGym;
    }
  | { mode: "not-found"; host: ParsedTenantHost; resolvedBy: null; gym: null };

type RawGymTenantDoc = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
  address?: string;
  currency?: string;
  status?: string;
  platformSubscription?: RawPlatformSubscription;
  branding?: {
    accentColor?: string;
    tagline?: string;
    logoText?: string;
  } | null;
};

const TENANT_SELECT_FIELDS =
  "name slug subdomain customDomain address currency status platformSubscription branding";

function normalizeTenantDoc(doc: RawGymTenantDoc): ResolvedTenantGym {
  const accent =
    doc.branding?.accentColor && /^#[0-9a-fA-F]{6}$/.test(doc.branding.accentColor)
      ? doc.branding.accentColor
      : "#45b58b";
  const tagline = doc.branding?.tagline?.trim() || doc.address?.trim() || "";
  const logoText = deriveGymInitials(doc.name, doc.branding?.logoText);

  const normalizedStatus: "pending" | "active" | "suspended" =
    doc.status === "suspended"
      ? "suspended"
      : doc.status === "pending"
        ? "pending"
        : "active";

  const subState = computeSubscriptionState(doc.platformSubscription, {
    gymStatus: normalizedStatus,
    gymCurrency: doc.currency,
  });

  return {
    _id: doc._id,
    name: doc.name,
    slug: doc.slug,
    subdomain: doc.subdomain?.trim().toLowerCase() || subdomainifyGymName(doc.name),
    customDomain: doc.customDomain?.trim().toLowerCase() || "",
    address: doc.address ?? "",
    status: normalizedStatus,
    accessAllowed: subState.accessAllowed,
    accessDeniedReason: subState.accessDeniedReason,
    branding: {
      accentColor: accent,
      tagline,
      logoText,
    },
  };
}

export async function findTenantGymBySlugOrLabel(
  rawLabel: string,
): Promise<ResolvedTenantGym | null> {
  const label = rawLabel.trim().toLowerCase();
  if (!label || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) {
    return null;
  }

  await connectToDatabase();

  const directMatch = await GymModel.findOne({
    $or: [{ slug: label }, { subdomain: label }],
  })
    .select(TENANT_SELECT_FIELDS)
    .lean<RawGymTenantDoc | null>();

  if (directMatch) {
    return normalizeTenantDoc(directMatch);
  }

  if (!label.includes("-")) {
    const candidates = await GymModel.find({
      $or: [{ subdomain: { $exists: false } }, { subdomain: null }, { subdomain: "" }],
    })
      .select(TENANT_SELECT_FIELDS)
      .lean<RawGymTenantDoc[]>();

    const matches = candidates.filter(
      (item) => item.slug.toLowerCase().replace(/-/g, "") === label,
    );
    if (matches.length === 1) {
      return normalizeTenantDoc(matches[0]);
    }
  }

  return null;
}

export async function resolveGymForHost(
  parsedHost: ParsedTenantHost,
): Promise<TenantHostLookupResult> {
  if (parsedHost.kind === "neutral") {
    return { mode: "neutral", host: parsedHost, resolvedBy: null, gym: null };
  }
  if (parsedHost.kind === "invalid-host") {
    return { mode: "not-found", host: parsedHost, resolvedBy: null, gym: null };
  }

  await connectToDatabase();

  if (parsedHost.kind === "subdomain") {
    const found = await findTenantGymBySlugOrLabel(parsedHost.subdomain);
    if (found) {
      return {
        mode: "tenant",
        host: parsedHost,
        resolvedBy: "subdomain",
        gym: found,
      };
    }
    return { mode: "not-found", host: parsedHost, resolvedBy: null, gym: null };
  }

  // Custom domain lookup
  const customMatch = await GymModel.findOne({
    customDomain: parsedHost.customDomain.toLowerCase(),
  })
    .select(TENANT_SELECT_FIELDS)
    .lean<RawGymTenantDoc | null>();

  if (!customMatch) {
    return { mode: "not-found", host: parsedHost, resolvedBy: null, gym: null };
  }

  return {
    mode: "tenant",
    host: parsedHost,
    resolvedBy: "custom-domain",
    gym: normalizeTenantDoc(customMatch),
  };
}

function extractRequestedPathSlug(request: Request): {
  present: boolean;
  slug: string;
  valid: boolean;
} {
  const headerSlug = request.headers.get("x-gymos-gym-slug")?.trim().toLowerCase() ?? "";
  if (headerSlug) {
    const valid =
      headerSlug.length >= 2 &&
      headerSlug.length <= 64 &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(headerSlug);
    return { present: true, slug: headerSlug, valid };
  }

  try {
    const url = new URL(request.url);
    const querySlug =
      url.searchParams.get("slug")?.trim().toLowerCase() ||
      url.searchParams.get("gymSlug")?.trim().toLowerCase() ||
      "";
    if (querySlug) {
      const valid =
        querySlug.length >= 2 &&
        querySlug.length <= 64 &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(querySlug);
      return { present: true, slug: querySlug, valid };
    }

    const fromPath = parseGymWorkspacePath(url.pathname);
    if (fromPath) {
      return { present: true, slug: fromPath.slug, valid: fromPath.validSlug };
    }
  } catch {
    // Ignore malformed URLs.
  }

  return { present: false, slug: "", valid: false };
}

/**
 * Unified tenant resolver supporting BOTH:
 * 1) Subdomain / custom-domain resolution (`<slug>.leelooconnect.com` / `<slug>.gymos.com`)
 * 2) Path-based `/gym/<slug>` resolution on neutral deployments (`gymos-web-api.onrender.com`)
 */
export async function resolveGymFromRequestHost(
  request: Request,
): Promise<TenantHostLookupResult> {
  const parsedHost = parseTenantHost(request);
  if (parsedHost.kind !== "neutral") {
    return resolveGymForHost(parsedHost);
  }

  const pathSlug = extractRequestedPathSlug(request);
  if (!pathSlug.present) {
    return { mode: "neutral", host: parsedHost, resolvedBy: null, gym: null };
  }
  if (!pathSlug.valid) {
    return { mode: "not-found", host: parsedHost, resolvedBy: null, gym: null };
  }

  const found = await findTenantGymBySlugOrLabel(pathSlug.slug);
  if (!found) {
    return { mode: "not-found", host: parsedHost, resolvedBy: null, gym: null };
  }

  return {
    mode: "tenant",
    host: parsedHost,
    resolvedBy: "path",
    gym: found,
  };
}

export function serializePublicTenantBranding(gym: ResolvedTenantGym) {
  const baseDomain = getConfiguredBaseDomain();
  return {
    id: gym._id.toString(),
    name: gym.name,
    slug: gym.slug,
    workspacePath: `/gym/${gym.slug}`,
    subdomain: gym.subdomain,
    subdomainUrl: `https://${gym.subdomain}.${baseDomain}`,
    customDomain: gym.customDomain || null,
    branding: gym.branding,
  };
}
