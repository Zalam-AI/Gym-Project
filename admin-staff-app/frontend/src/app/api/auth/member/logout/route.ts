import { memberApiOptions, memberApiResponse, clearMemberSessionCookie, isAllowedMemberOrigin } from "@/lib/member-auth";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function POST(request: Request) {
  if (!isAllowedMemberOrigin(request)) return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  const response = memberApiResponse(request, { success: true });
  clearMemberSessionCookie(response, request);
  return response;
}