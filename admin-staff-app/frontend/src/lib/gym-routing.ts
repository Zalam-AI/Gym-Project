const GYM_SLUG_SEGMENT_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ParsedGymWorkspacePath = {
  slug: string;
  subPath: string;
  validSlug: boolean;
};

/**
 * Parses `/gym/<slug>` and `/gym/<slug>/<subPath>` URLs.
 * Returns null if `pathname` is not under the `/gym` prefix.
 */
export function parseGymWorkspacePath(
  pathname: string | null | undefined,
): ParsedGymWorkspacePath | null {
  if (!pathname) return null;
  if (pathname === "/gym" || pathname === "/gym/") {
    return { slug: "", subPath: "/", validSlug: false };
  }
  if (!pathname.startsWith("/gym/")) {
    return null;
  }

  const remainder = pathname.slice("/gym/".length);
  const slashIdx = remainder.indexOf("/");
  const rawSegment = slashIdx === -1 ? remainder : remainder.slice(0, slashIdx);
  const rawRest = slashIdx === -1 ? "" : remainder.slice(slashIdx);

  let decoded = rawSegment;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    return { slug: "", subPath: "/", validSlug: false };
  }

  const normalizedSlug = decoded.trim().toLowerCase();
  const validSlug =
    normalizedSlug.length >= 2 &&
    normalizedSlug.length <= 64 &&
    GYM_SLUG_SEGMENT_REGEX.test(normalizedSlug);

  const subPath = !rawRest || rawRest === "/" ? "/" : rawRest.replace(/\/+$/, "") || "/";

  return {
    slug: normalizedSlug,
    subPath,
    validSlug,
  };
}

export function extractGymSlugFromPathname(
  pathname: string | null | undefined,
): string | null {
  const parsed = parseGymWorkspacePath(pathname);
  return parsed && parsed.validSlug ? parsed.slug : null;
}

/**
 * Builds an isolated gym workspace path:
 * - When `slug` is provided (path-based multi-gym mode on neutral hosts), scopes routes under `/gym/<slug>`
 * - When `slug` is omitted/null (subdomain mode `<slug>.leelooconnect.com`), preserves root-relative paths
 */
export function buildGymPath(subPath: string, slug?: string | null): string {
  const normalizedSub = !subPath || subPath === "/"
    ? "/"
    : subPath.startsWith("/")
      ? subPath
      : `/${subPath}`;

  if (!slug || !slug.trim()) {
    return normalizedSub;
  }
  if (normalizedSub === `/gym/${slug}` || normalizedSub.startsWith(`/gym/${slug}/`)) {
    return normalizedSub;
  }
  if (normalizedSub.startsWith("/gym/")) {
    return normalizedSub;
  }
  const cleanSlug = slug.trim().toLowerCase();
  return normalizedSub === "/" ? `/gym/${cleanSlug}` : `/gym/${cleanSlug}${normalizedSub}`;
}

export function doesGymIdentityMatchSlug(
  gym: { slug?: string | null; subdomain?: string | null },
  requestedSlug: string,
): boolean {
  const target = requestedSlug.trim().toLowerCase();
  if (!target) return false;
  const slug = gym.slug?.trim().toLowerCase() ?? "";
  const subdomain = gym.subdomain?.trim().toLowerCase() ?? "";
  if (slug && slug === target) return true;
  if (subdomain && subdomain === target) return true;
  if (slug && slug.replace(/-/g, "") === target) return true;
  return false;
}

export function isNeutralBrowserHostname(hostname: string): boolean {
  const clean = hostname.trim().toLowerCase();
  return (
    !clean ||
    clean === "localhost" ||
    clean === "0.0.0.0" ||
    clean === "127.0.0.1" ||
    clean.endsWith(".onrender.com") ||
    clean.endsWith(".e2b.app") ||
    clean.endsWith(".vercel.app")
  );
}
