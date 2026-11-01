import { doesGymIdentityMatchSlug } from "@/lib/gym-routing";

const TENANT_PARAM_KEYS = ["gymId", "gym_id", "tenantId", "tenant_id", "gymSlug", "gym_slug"] as const;
const TENANT_HEADER_KEYS = ["x-gym-id", "x-tenant-id", "x-gymos-gym-slug"] as const;

/**
 * Extracts any explicit tenant/gym identifier supplied by the caller via query string,
 * custom headers, or parsed JSON body so server routes can detect and reject cross-gym tampering.
 */
export function extractRequestedGymRefs(
  request: Request,
  body?: Record<string, unknown> | null,
): string[] {
  const refs: string[] = [];

  try {
    const url = new URL(request.url);
    for (const key of TENANT_PARAM_KEYS) {
      for (const val of url.searchParams.getAll(key)) {
        const trimmed = val.trim();
        if (trimmed) refs.push(trimmed);
      }
    }
  } catch {
    // Ignore malformed URLs.
  }

  for (const header of TENANT_HEADER_KEYS) {
    const raw = request.headers.get(header)?.trim();
    if (raw) refs.push(raw);
  }

  if (body && typeof body === "object") {
    for (const key of TENANT_PARAM_KEYS) {
      const val = body[key];
      if (typeof val === "string" && val.trim()) {
        refs.push(val.trim());
      }
    }
  }

  return refs;
}

function matchesAuthorizedGym(
  candidate: string,
  authorizedGym: { id: string; slug?: string; subdomain?: string | null },
): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return true;
  if (trimmed === authorizedGym.id) return true;
  const upperPrefix = "GYMOS-GYM:";
  if (trimmed.toUpperCase().startsWith(upperPrefix)) {
    const inner = trimmed.slice(upperPrefix.length).trim();
    if (inner === authorizedGym.id) return true;
    if (
      doesGymIdentityMatchSlug(
        { slug: authorizedGym.slug, subdomain: authorizedGym.subdomain },
        inner,
      )
    ) {
      return true;
    }
    return false;
  }
  if (
    doesGymIdentityMatchSlug(
      { slug: authorizedGym.slug, subdomain: authorizedGym.subdomain },
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true if the caller explicitly passed any `gymId` / `tenantId` / `x-gymos-gym-slug`
 * in query params, headers, or JSON body that conflicts with the authenticated user's verified gym.
 */
export function hasConflictingGymRef(
  request: Request,
  authorizedGym: { id: string; slug?: string; subdomain?: string | null },
  body?: Record<string, unknown> | null,
): boolean {
  const refs = extractRequestedGymRefs(request, body);
  return refs.some((ref) => !matchesAuthorizedGym(ref, authorizedGym));
}
