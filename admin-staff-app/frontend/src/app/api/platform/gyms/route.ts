import { NextResponse } from "next/server";
import { Types } from "mongoose";
import {
  DEFAULT_GYM_CAPACITY,
  DEFAULT_GYM_TIMEZONE,
  isValidTimezone,
  normalizeTimezone,
  slugifyGymName,
  subdomainifyGymName,
} from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase, runInTransactionOrFallback } from "gymos-admin-backend/lib/mongodb";
import { hashStaffPassword } from "gymos-admin-backend/lib/staff-password";
import { generateStaffInviteCode } from "gymos-admin-backend/lib/trainer-code";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel, {
  GYM_STATUSES,
  PLATFORM_BILLING_CYCLES,
  PLATFORM_BILLING_STATUSES,
  PLATFORM_PLAN_TIERS,
  type GymStatus,
  type PlatformBillingCycle,
  type PlatformBillingStatus,
  type PlatformPlanTier,
} from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipPlanModel from "gymos-admin-backend/models/membership-plan";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import StaffInviteModel from "gymos-admin-backend/models/staff-invite";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import TrainerModel from "gymos-admin-backend/models/trainer";
import { normalizePhone } from "@/lib/member-auth";
import {
  hasPlatformPermission,
  recordPlatformAudit,
  requirePlatformAdmin,
} from "@/lib/platform-context";
import {
  deriveGymInitials,
  getConfiguredBaseDomain,
  isValidCustomDomainHostname,
  isValidGymSubdomainLabel,
} from "@/lib/tenant-domain";

export const runtime = "nodejs";

const VALID_GYM_STATUSES = new Set<string>(GYM_STATUSES);
const VALID_PLAN_TIERS = new Set<string>(PLATFORM_PLAN_TIERS);
const VALID_BILLING_STATUSES = new Set<string>(PLATFORM_BILLING_STATUSES);
const VALID_BILLING_CYCLES = new Set<string>(PLATFORM_BILLING_CYCLES);

const starterPlans = [
  {
    name: "1 Month Regular",
    price: 1800,
    durationMonths: 1,
    featured: false,
    benefits: [
      "Full gym floor & cardio access",
      "Locker room & shower facilities",
      "Digital QR member pass",
    ],
  },
  {
    name: "3 Month Saver",
    price: 4500,
    durationMonths: 3,
    featured: true,
    benefits: [
      "Full gym floor & free weights",
      "2 group fitness classes / week",
      "1 InBody composition scan",
    ],
  },
  {
    name: "VIP Annual",
    price: 18000,
    durationMonths: 12,
    featured: false,
    benefits: [
      "Unlimited club access all year",
      "Personal trainer & custom workout plan",
      "Monthly InBody scans & recovery lounge",
    ],
  },
] as const;

type LeanGymDoc = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
  address: string;
  phone: string;
  status: string;
  statusNote?: string;
  approvedAt?: Date | null;
  capacity: number;
  timezone: string;
  currency: string;
  ownerUserId?: Types.ObjectId | null;
  platformSubscription?: {
    planTier?: string;
    billingStatus?: string;
    billingCycle?: string;
    renewalDate?: Date | null;
    notes?: string;
  } | null;
  createdAt?: Date;
};

type LeanOwnerDoc = {
  _id: Types.ObjectId;
  gymId: Types.ObjectId;
  fullName: string;
  email: string;
  status: string;
};

async function generateUniqueGymSlug(gymName: string): Promise<string> {
  const base = slugifyGymName(gymName);
  const existingBase = await GymModel.exists({ slug: base });
  if (!existingBase) return base;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base.slice(0, 56)}-${suffix}`;
    const taken = await GymModel.exists({ slug: candidate });
    if (!taken) return candidate;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36).slice(-6)}`;
}

async function generateUniqueGymSubdomain(gymName: string): Promise<string> {
  const base = subdomainifyGymName(gymName);
  const existingBase = await GymModel.exists({
    $or: [{ subdomain: base }, { slug: base }],
  });
  if (!existingBase) return base;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base.slice(0, 44)}${suffix}`;
    const taken = await GymModel.exists({
      $or: [{ subdomain: candidate }, { slug: candidate }],
    });
    if (!taken) return candidate;
  }
  return `${base.slice(0, 40)}${Date.now().toString(36).slice(-6)}`;
}

async function createUniqueStaffInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateStaffInviteCode();
    const exists = await StaffInviteModel.exists({ code: candidate });
    if (!exists) return candidate;
  }
  return generateStaffInviteCode();
}

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request, "gyms:read");
    if (auth.response) return auth.response;
    const { ctx } = auth;

    await connectToDatabase();
    const includeMetrics = hasPlatformPermission(ctx, "platform:metrics");
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      gyms,
      staffCounts,
      memberCounts,
      trainerCounts,
      activeMembershipCounts,
      owners,
      unaffiliatedMembersCount,
      pendingRequestsCount,
      checkIns24hCount,
    ] = await Promise.all([
      GymModel.find({}).sort({ createdAt: -1 }).lean<LeanGymDoc[]>(),
      StaffUserModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
      MemberModel.aggregate<{ _id: Types.ObjectId | null; count: number }>([
        { $match: { gymId: { $ne: null } } },
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
      TrainerModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
      MembershipModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { expiryDate: { $gte: now } } },
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
      StaffUserModel.find({ role: "owner" })
        .select("gymId fullName email status")
        .sort({ createdAt: 1 })
        .lean<LeanOwnerDoc[]>(),
      includeMetrics
        ? MemberModel.countDocuments({ $or: [{ gymId: { $exists: false } }, { gymId: null }] })
        : Promise.resolve(0),
      includeMetrics
        ? MembershipRequestModel.countDocuments({ status: "pending" })
        : Promise.resolve(0),
      includeMetrics
        ? AttendanceModel.countDocuments({ checkInTime: { $gte: since24h } })
        : Promise.resolve(0),
    ]);

    const staffByGym = new Map(staffCounts.map((item) => [String(item._id), item.count]));
    const membersByGym = new Map(
      memberCounts
        .filter((item): item is { _id: Types.ObjectId; count: number } => Boolean(item._id))
        .map((item) => [String(item._id), item.count]),
    );
    const trainersByGym = new Map(trainerCounts.map((item) => [String(item._id), item.count]));
    const activeMembershipsByGym = new Map(
      activeMembershipCounts.map((item) => [String(item._id), item.count]),
    );

    const ownerByGym = new Map<string, LeanOwnerDoc>();
    for (const owner of owners) {
      const gid = String(owner.gymId);
      if (!ownerByGym.has(gid)) {
        ownerByGym.set(gid, owner);
      }
    }

    const baseDomain = getConfiguredBaseDomain();

    const serializedGyms = gyms.map((gym) => {
      const id = String(gym._id);
      const owner = ownerByGym.get(id);
      const subdomain =
        typeof gym.subdomain === "string" && gym.subdomain.trim()
          ? gym.subdomain.trim().toLowerCase()
          : subdomainifyGymName(gym.name);
      const customDomain =
        typeof gym.customDomain === "string" && gym.customDomain.trim()
          ? gym.customDomain.trim().toLowerCase()
          : "";
      const status: GymStatus =
        gym.status === "suspended"
          ? "suspended"
          : gym.status === "pending"
            ? "pending"
            : "active";

      const rawSub = gym.platformSubscription;
      const planTier: PlatformPlanTier =
        rawSub?.planTier && VALID_PLAN_TIERS.has(rawSub.planTier)
          ? (rawSub.planTier as PlatformPlanTier)
          : "trial";
      const billingStatus: PlatformBillingStatus =
        rawSub?.billingStatus && VALID_BILLING_STATUSES.has(rawSub.billingStatus)
          ? (rawSub.billingStatus as PlatformBillingStatus)
          : "trialing";
      const billingCycle: PlatformBillingCycle =
        rawSub?.billingCycle && VALID_BILLING_CYCLES.has(rawSub.billingCycle)
          ? (rawSub.billingCycle as PlatformBillingCycle)
          : "monthly";

      return {
        id,
        name: gym.name,
        slug: gym.slug,
        subdomain,
        subdomainUrl: `https://${subdomain}.${baseDomain}`,
        customDomain: customDomain || null,
        address: gym.address,
        phone: gym.phone,
        status,
        statusNote: gym.statusNote ?? "",
        approvedAt: gym.approvedAt ? new Date(gym.approvedAt).toISOString() : null,
        capacity: gym.capacity,
        timezone: gym.timezone,
        currency: gym.currency,
        owner: owner
          ? {
              id: String(owner._id),
              name: owner.fullName,
              email: owner.email,
              status: owner.status === "inactive" ? "inactive" : "active",
            }
          : null,
        platformSubscription: {
          planTier,
          billingStatus,
          billingCycle,
          renewalDate: rawSub?.renewalDate ? new Date(rawSub.renewalDate).toISOString() : null,
          notes: rawSub?.notes ?? "",
        },
        staffCount: staffByGym.get(id) ?? 0,
        memberCount: membersByGym.get(id) ?? 0,
        trainerCount: trainersByGym.get(id) ?? 0,
        activeMembershipsCount: activeMembershipsByGym.get(id) ?? 0,
        createdAt: gym.createdAt ? new Date(gym.createdAt).toISOString() : null,
      };
    });

    const subscriptionBreakdown = {
      trialing: serializedGyms.filter((g) => g.platformSubscription.billingStatus === "trialing")
        .length,
      active: serializedGyms.filter((g) => g.platformSubscription.billingStatus === "active")
        .length,
      past_due: serializedGyms.filter((g) => g.platformSubscription.billingStatus === "past_due")
        .length,
      paused: serializedGyms.filter((g) => g.platformSubscription.billingStatus === "paused")
        .length,
      canceled: serializedGyms.filter((g) => g.platformSubscription.billingStatus === "canceled")
        .length,
    };

    return NextResponse.json({
      admin: {
        id: ctx.adminId.toString(),
        name: ctx.fullName,
        email: ctx.email,
        role: ctx.role,
        permissions: ctx.permissions,
      },
      baseDomain,
      ...(includeMetrics
        ? {
            summary: {
              totalGyms: serializedGyms.length,
              activeGyms: serializedGyms.filter((g) => g.status === "active").length,
              pendingGyms: serializedGyms.filter((g) => g.status === "pending").length,
              suspendedGyms: serializedGyms.filter((g) => g.status === "suspended").length,
              totalEnrolledMembers: serializedGyms.reduce((s, g) => s + g.memberCount, 0),
              unaffiliatedMobileMembers: unaffiliatedMembersCount,
              totalStaffUsers: serializedGyms.reduce((s, g) => s + g.staffCount, 0),
              totalTrainers: serializedGyms.reduce((s, g) => s + g.trainerCount, 0),
              activeMemberSubscriptions: serializedGyms.reduce(
                (s, g) => s + g.activeMembershipsCount,
                0,
              ),
              pendingMemberRequests: pendingRequestsCount,
              checkInsLast24h: checkIns24hCount,
              subscriptionBreakdown,
            },
          }
        : {}),
      gyms: serializedGyms,
    });
  } catch (error) {
    console.error("Failed to list platform gyms:", error);
    return NextResponse.json(
      { error: "Unable to load platform gym registry right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request, "gyms:write");
  if (auth.response) return auth.response;
  const { ctx } = auth;

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    input = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const action = typeof input.action === "string" ? input.action : "";

  try {
    await connectToDatabase();

    // ---------------------------------------------------------
    // 1. APPROVE / SUSPEND / REACTIVATE GYM STATUS
    // ---------------------------------------------------------
    if (action === "set-status") {
      const gymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
      const status = typeof input.status === "string" ? input.status : "";
      const statusNote =
        typeof input.statusNote === "string" ? input.statusNote.trim().slice(0, 240) : undefined;

      if (!Types.ObjectId.isValid(gymId) || !VALID_GYM_STATUSES.has(status)) {
        return NextResponse.json(
          { error: "Valid gymId and status (active, pending, or suspended) are required." },
          { status: 400 },
        );
      }

      const existing = await GymModel.findById(gymId).select("name slug status");
      if (!existing) {
        return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
      }

      const previousStatus = existing.status;
      const updateSet: Record<string, unknown> = { status };
      if (statusNote !== undefined) {
        updateSet.statusNote = statusNote;
      }
      if (status === "active" && previousStatus === "pending") {
        updateSet.approvedAt = new Date();
        updateSet.approvedByAdminId = ctx.adminId;
      }

      const updated = await GymModel.findOneAndUpdate(
        { _id: existing._id },
        { $set: updateSet },
        { new: true },
      ).select("name slug status statusNote approvedAt");

      if (!updated) {
        return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
      }

      const auditAction =
        status === "suspended"
          ? "gym.suspended"
          : previousStatus === "pending" && status === "active"
            ? "gym.approved"
            : status === "active"
              ? "gym.reactivated"
              : "gym.status_changed";

      await recordPlatformAudit(ctx, request, {
        action: auditAction,
        targetType: "gym",
        targetId: updated._id.toString(),
        targetLabel: updated.name,
        summary: `Changed ${updated.name} status from "${previousStatus}" to "${status}".${
          statusNote ? ` Note: ${statusNote}` : ""
        }`,
        metadata: { previousStatus, newStatus: status, statusNote: statusNote ?? "" },
      });

      return NextResponse.json({
        gym: {
          id: updated._id.toString(),
          name: updated.name,
          slug: updated.slug,
          status: updated.status,
          statusNote: updated.statusNote ?? "",
          approvedAt: updated.approvedAt ? new Date(updated.approvedAt).toISOString() : null,
        },
      });
    }

    // ---------------------------------------------------------
    // 2. PROVISION A NEW GYM TENANT & OWNER ACCOUNT / INVITE
    // ---------------------------------------------------------
    if (action === "create-gym") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const address = typeof input.address === "string" ? input.address.trim() : "";
      const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
      const phone = normalizePhone(rawPhone) || rawPhone;
      const requestedSubdomain =
        typeof input.subdomain === "string" && input.subdomain.trim()
          ? input.subdomain.trim().toLowerCase()
          : "";
      const capacity =
        typeof input.capacity === "number" &&
        Number.isInteger(input.capacity) &&
        input.capacity >= 1 &&
        input.capacity <= 5000
          ? input.capacity
          : DEFAULT_GYM_CAPACITY;
      const timezone = normalizeTimezone(
        typeof input.timezone === "string" ? input.timezone : DEFAULT_GYM_TIMEZONE,
      );
      const currency =
        typeof input.currency === "string" && input.currency.trim()
          ? input.currency.trim().toUpperCase().slice(0, 8)
          : "EGP";
      const initialStatus: GymStatus = input.status === "pending" ? "pending" : "active";

      const planTier: PlatformPlanTier =
        typeof input.planTier === "string" && VALID_PLAN_TIERS.has(input.planTier)
          ? (input.planTier as PlatformPlanTier)
          : "starter";
      const billingStatus: PlatformBillingStatus =
        typeof input.billingStatus === "string" && VALID_BILLING_STATUSES.has(input.billingStatus)
          ? (input.billingStatus as PlatformBillingStatus)
          : planTier === "trial"
            ? "trialing"
            : "active";
      const billingCycle: PlatformBillingCycle =
        typeof input.billingCycle === "string" && VALID_BILLING_CYCLES.has(input.billingCycle)
          ? (input.billingCycle as PlatformBillingCycle)
          : "monthly";
      const subscriptionNotes =
        typeof input.subscriptionNotes === "string"
          ? input.subscriptionNotes.trim().slice(0, 300)
          : "";

      const ownerName = typeof input.ownerName === "string" ? input.ownerName.trim() : "";
      const ownerEmail =
        typeof input.ownerEmail === "string" ? input.ownerEmail.trim().toLowerCase() : "";
      const ownerPassword = typeof input.ownerPassword === "string" ? input.ownerPassword : "";

      if (!name || name.length < 2 || name.length > 100) {
        return NextResponse.json(
          { error: "Gym name is required (2–100 characters)." },
          { status: 400 },
        );
      }
      if (!address || address.length < 2 || address.length > 200) {
        return NextResponse.json(
          { error: "Gym address is required (2–200 characters)." },
          { status: 400 },
        );
      }
      if (!phone || phone.length < 6 || phone.length > 30) {
        return NextResponse.json(
          { error: "Enter a valid gym phone number." },
          { status: 400 },
        );
      }
      if (requestedSubdomain && !isValidGymSubdomainLabel(requestedSubdomain)) {
        return NextResponse.json(
          {
            error:
              "Subdomain must be 2–63 lowercase letters, numbers, or hyphens and cannot use a reserved word.",
          },
          { status: 400 },
        );
      }

      const createDirectOwner = Boolean(ownerName || ownerEmail || ownerPassword);
      if (createDirectOwner) {
        if (!ownerName || ownerName.length > 100) {
          return NextResponse.json(
            { error: "Owner full name is required when provisioning an owner account." },
            { status: 400 },
          );
        }
        if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
          return NextResponse.json(
            { error: "Valid owner email is required when provisioning an owner account." },
            { status: 400 },
          );
        }
        if (ownerPassword.length < 10 || ownerPassword.length > 128) {
          return NextResponse.json(
            { error: "Owner password must be between 10 and 128 characters." },
            { status: 400 },
          );
        }
        const existingStaff = await StaffUserModel.exists({ email: ownerEmail });
        if (existingStaff) {
          return NextResponse.json(
            { error: "A staff/owner account with that email already exists." },
            { status: 409 },
          );
        }
      }

      if (requestedSubdomain) {
        const subTaken = await GymModel.exists({
          $or: [{ subdomain: requestedSubdomain }, { slug: requestedSubdomain }],
        });
        if (subTaken) {
          return NextResponse.json(
            { error: "That gym subdomain is already registered to another gym." },
            { status: 409 },
          );
        }
      }

      const slug = await generateUniqueGymSlug(name);
      const subdomain = requestedSubdomain || (await generateUniqueGymSubdomain(name));
      const logoText = deriveGymInitials(name);
      const passwordHash = createDirectOwner ? await hashStaffPassword(ownerPassword) : null;
      const inviteCode = !createDirectOwner ? await createUniqueStaffInviteCode() : null;

      const created = await runInTransactionOrFallback(async (tx) => {
        const sessionOpt = tx ? { session: tx } : {};
        const [gymDoc] = await GymModel.create(
          [
            {
              name,
              slug,
              subdomain,
              branding: {
                accentColor: "#45b58b",
                logoText,
              },
              platformSubscription: {
                planTier,
                billingStatus,
                billingCycle,
                notes: subscriptionNotes || "Provisioned by GymOS Platform Administrator",
              },
              address,
              phone,
              status: initialStatus,
              ...(initialStatus === "active"
                ? { approvedAt: new Date(), approvedByAdminId: ctx.adminId }
                : {}),
              capacity,
              timezone,
              currency,
            },
          ],
          sessionOpt,
        );

        let ownerDoc: { _id: Types.ObjectId; fullName: string; email: string } | null = null;
        if (createDirectOwner && passwordHash) {
          const [createdUser] = await StaffUserModel.create(
            [
              {
                gymId: gymDoc._id,
                fullName: ownerName,
                email: ownerEmail,
                passwordHash,
                role: "owner",
                status: "active",
              },
            ],
            sessionOpt,
          );
          gymDoc.ownerUserId = createdUser._id;
          await gymDoc.save(sessionOpt);
          ownerDoc = {
            _id: createdUser._id,
            fullName: createdUser.fullName,
            email: createdUser.email,
          };
        } else if (inviteCode) {
          const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
          await StaffInviteModel.create(
            [
              {
                gymId: gymDoc._id,
                code: inviteCode,
                role: "owner",
                presetName: `${name} Owner`,
                status: "unused",
                expiresAt,
              },
            ],
            sessionOpt,
          );
        }

        await MembershipPlanModel.insertMany(
          starterPlans.map((plan) => ({
            gymId: gymDoc._id,
            name: plan.name,
            price: plan.price,
            durationMonths: plan.durationMonths,
            featured: plan.featured,
            benefits: [...plan.benefits],
            active: true,
          })),
          sessionOpt,
        );

        return { gymDoc, ownerDoc };
      });

      await recordPlatformAudit(ctx, request, {
        action: "gym.created",
        targetType: "gym",
        targetId: created.gymDoc._id.toString(),
        targetLabel: created.gymDoc.name,
        summary: `Provisioned gym workspace "${created.gymDoc.name}" (${subdomain}, status: ${initialStatus}, tier: ${planTier}).`,
        metadata: {
          slug,
          subdomain,
          status: initialStatus,
          planTier,
          billingStatus,
          ownerProvisioned: Boolean(created.ownerDoc),
        },
      });

      return NextResponse.json(
        {
          gym: {
            id: created.gymDoc._id.toString(),
            name: created.gymDoc.name,
            slug: created.gymDoc.slug,
            subdomain,
            status: initialStatus,
          },
          owner: created.ownerDoc
            ? {
                name: created.ownerDoc.fullName,
                email: created.ownerDoc.email,
              }
            : null,
          ownerInviteCode: inviteCode,
        },
        { status: 201 },
      );
    }

    // ---------------------------------------------------------
    // 3. UPDATE GYM ACCOUNT PROFILE & ROUTING DOMAINS
    // ---------------------------------------------------------
    if (action === "update-gym") {
      const gymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
      if (!Types.ObjectId.isValid(gymId)) {
        return NextResponse.json({ error: "Valid gymId is required." }, { status: 400 });
      }

      const name = typeof input.name === "string" ? input.name.trim() : "";
      const address = typeof input.address === "string" ? input.address.trim() : "";
      const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
      const phone = normalizePhone(rawPhone) || rawPhone;
      const capacity = input.capacity;
      const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";

      if (!name || name.length < 2 || name.length > 100) {
        return NextResponse.json(
          { error: "Gym name must be between 2 and 100 characters." },
          { status: 400 },
        );
      }
      if (!address || address.length < 2 || address.length > 200) {
        return NextResponse.json(
          { error: "Address must be between 2 and 200 characters." },
          { status: 400 },
        );
      }
      if (!phone || phone.length < 6 || phone.length > 30) {
        return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
      }
      if (
        typeof capacity !== "number" ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 5000
      ) {
        return NextResponse.json(
          { error: "Floor capacity must be a whole number between 1 and 5000." },
          { status: 400 },
        );
      }
      if (!isValidTimezone(timezone)) {
        return NextResponse.json(
          { error: "Select a valid IANA timezone (e.g. Africa/Cairo)." },
          { status: 400 },
        );
      }

      const targetObjectId = new Types.ObjectId(gymId);
      const setFields: Record<string, unknown> = { name, address, phone, capacity, timezone };
      const unsetFields: Record<string, 1> = {};

      if ("subdomain" in input && typeof input.subdomain === "string") {
        const subdomain = input.subdomain.trim().toLowerCase();
        if (!subdomain || !isValidGymSubdomainLabel(subdomain)) {
          return NextResponse.json(
            {
              error:
                "Subdomain must be 2–63 lowercase letters, numbers, or hyphens and cannot use a reserved word.",
            },
            { status: 400 },
          );
        }
        const conflict = await GymModel.exists({
          _id: { $ne: targetObjectId },
          $or: [{ subdomain }, { slug: subdomain }],
        });
        if (conflict) {
          return NextResponse.json(
            { error: "That subdomain is already assigned to another gym." },
            { status: 409 },
          );
        }
        setFields.subdomain = subdomain;
      }

      if ("customDomain" in input && typeof input.customDomain === "string") {
        const customDomain = input.customDomain.trim().toLowerCase();
        if (!customDomain) {
          unsetFields.customDomain = 1;
        } else {
          if (!isValidCustomDomainHostname(customDomain)) {
            return NextResponse.json(
              { error: "Enter a valid custom domain hostname without http:// or paths." },
              { status: 400 },
            );
          }
          const conflict = await GymModel.exists({
            _id: { $ne: targetObjectId },
            customDomain,
          });
          if (conflict) {
            return NextResponse.json(
              { error: "That custom domain is already linked to another gym." },
              { status: 409 },
            );
          }
          setFields.customDomain = customDomain;
        }
      }

      const updateDoc: Record<string, unknown> = { $set: setFields };
      if (Object.keys(unsetFields).length > 0) {
        updateDoc.$unset = unsetFields;
      }

      const updated = await GymModel.findOneAndUpdate({ _id: targetObjectId }, updateDoc, {
        new: true,
        runValidators: true,
      }).select("name slug subdomain customDomain address phone capacity timezone");

      if (!updated) {
        return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
      }

      await recordPlatformAudit(ctx, request, {
        action: "gym.updated",
        targetType: "gym",
        targetId: updated._id.toString(),
        targetLabel: updated.name,
        summary: `Updated gym profile & routing settings for "${updated.name}".`,
        metadata: {
          subdomain: updated.subdomain ?? "",
          customDomain: updated.customDomain ?? "",
          capacity: updated.capacity,
          timezone: updated.timezone,
        },
      });

      return NextResponse.json({
        gym: {
          id: updated._id.toString(),
          name: updated.name,
          slug: updated.slug,
          subdomain: updated.subdomain ?? subdomainifyGymName(updated.name),
          customDomain: updated.customDomain ?? null,
          address: updated.address,
          phone: updated.phone,
          capacity: updated.capacity,
          timezone: updated.timezone,
        },
      });
    }

    // ---------------------------------------------------------
    // 4. UPDATE MANUAL PLATFORM SUBSCRIPTION STATUS (NO FAKE GATEWAY)
    // ---------------------------------------------------------
    if (action === "update-subscription") {
      const gymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
      const planTier = typeof input.planTier === "string" ? input.planTier : "";
      const billingStatus = typeof input.billingStatus === "string" ? input.billingStatus : "";
      const billingCycle =
        typeof input.billingCycle === "string" && VALID_BILLING_CYCLES.has(input.billingCycle)
          ? (input.billingCycle as PlatformBillingCycle)
          : "monthly";
      const notes =
        typeof input.notes === "string" ? input.notes.trim().slice(0, 300) : "";
      const rawRenewalDate =
        typeof input.renewalDate === "string" ? input.renewalDate.trim() : "";

      if (
        !Types.ObjectId.isValid(gymId) ||
        !VALID_PLAN_TIERS.has(planTier) ||
        !VALID_BILLING_STATUSES.has(billingStatus)
      ) {
        return NextResponse.json(
          { error: "Valid gymId, planTier, and billingStatus are required." },
          { status: 400 },
        );
      }

      let parsedRenewalDate: Date | null = null;
      if (rawRenewalDate) {
        const candidate = new Date(rawRenewalDate);
        if (Number.isNaN(candidate.getTime())) {
          return NextResponse.json(
            { error: "renewalDate must be a valid ISO date." },
            { status: 400 },
          );
        }
        parsedRenewalDate = candidate;
      }

      const updateQuery: Record<string, unknown> = {
        $set: {
          "platformSubscription.planTier": planTier,
          "platformSubscription.billingStatus": billingStatus,
          "platformSubscription.billingCycle": billingCycle,
          "platformSubscription.notes": notes,
          ...(parsedRenewalDate ? { "platformSubscription.renewalDate": parsedRenewalDate } : {}),
        },
        ...(!parsedRenewalDate ? { $unset: { "platformSubscription.renewalDate": 1 } } : {}),
      };

      const updated = await GymModel.findOneAndUpdate(
        { _id: new Types.ObjectId(gymId) },
        updateQuery,
        { new: true, runValidators: true },
      ).select("name slug platformSubscription");

      if (!updated) {
        return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
      }

      await recordPlatformAudit(ctx, request, {
        action: "gym.subscription_updated",
        targetType: "gym",
        targetId: updated._id.toString(),
        targetLabel: updated.name,
        summary: `Updated manual subscription record for "${updated.name}" to ${planTier} (${billingStatus}, ${billingCycle}).`,
        metadata: {
          planTier,
          billingStatus,
          billingCycle,
          renewalDate: parsedRenewalDate ? parsedRenewalDate.toISOString() : null,
        },
      });

      return NextResponse.json({
        gym: {
          id: updated._id.toString(),
          name: updated.name,
          platformSubscription: {
            planTier,
            billingStatus,
            billingCycle,
            renewalDate: parsedRenewalDate ? parsedRenewalDate.toISOString() : null,
            notes,
          },
        },
      });
    }

    // ---------------------------------------------------------
    // 5. ISSUE ONE-TIME GYM OWNER INVITATION CODE
    // ---------------------------------------------------------
    if (action === "issue-owner-invite") {
      const gymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
      const presetEmail =
        typeof input.presetEmail === "string" && input.presetEmail.trim()
          ? input.presetEmail.trim().toLowerCase()
          : "";
      if (!Types.ObjectId.isValid(gymId)) {
        return NextResponse.json({ error: "Valid gymId is required." }, { status: 400 });
      }
      if (presetEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(presetEmail)) {
        return NextResponse.json(
          { error: "Enter a valid preset email or leave blank." },
          { status: 400 },
        );
      }

      const gym = await GymModel.findById(gymId).select("name slug");
      if (!gym) {
        return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
      }

      const code = await createUniqueStaffInviteCode();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await StaffInviteModel.create({
        gymId: gym._id,
        code,
        role: "owner",
        presetName: `${gym.name} Owner`,
        ...(presetEmail ? { presetEmail } : {}),
        status: "unused",
        expiresAt,
      });

      await recordPlatformAudit(ctx, request, {
        action: "gym.owner_invite_issued",
        targetType: "gym",
        targetId: gym._id.toString(),
        targetLabel: gym.name,
        summary: `Issued one-time gym owner invite code for "${gym.name}".`,
        metadata: { presetEmail: presetEmail || null, expiresAt: expiresAt.toISOString() },
      });

      return NextResponse.json(
        {
          invite: {
            code,
            gymName: gym.name,
            presetEmail: presetEmail || null,
            expiresAt: expiresAt.toISOString(),
          },
        },
        { status: 201 },
      );
    }

    return NextResponse.json({ error: "Unsupported platform action." }, { status: 400 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { error: "Conflict: email, subdomain, or custom domain is already in use." },
        { status: 409 },
      );
    }
    console.error("Failed to execute platform gym management action:", error);
    return NextResponse.json(
      { error: "Unable to complete platform action right now." },
      { status: 503 },
    );
  }
}
