import { Types } from "mongoose";
import { getStaffTokenFromRequest, verifyStaffSessionToken } from "@/lib/staff-session";

export async function resolveActiveGymId(request?: Request): Promise<Types.ObjectId | null> {
  if (request) {
    const token = getStaffTokenFromRequest(request);
    const session = await verifyStaffSessionToken(token);
    if (session && Types.ObjectId.isValid(session.gymId)) {
      return new Types.ObjectId(session.gymId);
    }
  }

  const envGymId = process.env.GYMOS_GYM_ID;
  if (envGymId && Types.ObjectId.isValid(envGymId)) {
    return new Types.ObjectId(envGymId);
  }
  return null;
}
