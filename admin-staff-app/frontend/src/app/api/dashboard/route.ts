import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import PaymentModel from "gymos-admin-backend/models/payment";
import { resolveActiveGymId } from "@/lib/gym-context";

export const runtime = "nodejs";

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function GET(request: Request) {
  const gymId = await resolveActiveGymId(request);
  if (!gymId) {
    return NextResponse.json(
      { error: "GYMOS_GYM_ID must be set to a valid gym ID." },
      { status: 500 },
    );
  }

  try {
    await connectToDatabase();
    const gym = await GymModel.findById(gymId).select("name slug");
    if (!gym) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [members, memberships, payments, recentCheckIns, currentlyInside, pendingSubRequests] =
      await Promise.all([
        MemberModel.find({ gymId }).sort({ createdAt: -1 }).lean(),
        MembershipModel.find({ gymId }).sort({ expiryDate: -1 }).lean(),
        PaymentModel.find({ gymId }).sort({ date: -1 }).lean(),
        AttendanceModel.find({ gymId, checkInTime: { $gte: sevenDaysAgo, $lt: tomorrow } })
          .select("checkInTime memberId status")
          .lean(),
        AttendanceModel.countDocuments({ gymId, status: "checked-in" }),
        MembershipRequestModel.find({ gymId, status: "pending" })
          .populate({ path: "memberId", model: MemberModel, select: "fullName" })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

    const memberById = new Map<string, (typeof members)[number]>();
    for (const member of members) {
      memberById.set(String(member._id), member);
    }

    const latestMembershipByMember = new Map<string, (typeof memberships)[number]>();
    for (const membership of memberships) {
      const memberId = membership.memberId.toString();
      if (!latestMembershipByMember.has(memberId)) {
        latestMembershipByMember.set(memberId, membership);
      }
    }

    let activeMembers = 0;
    let newMembersThisMonth = 0;
    let newMembersLastMonth = 0;

    for (const member of members) {
      const joinDate = new Date(member.joinDate);
      if (joinDate >= monthStart) {
        newMembersThisMonth += 1;
      } else if (joinDate >= lastMonthStart && joinDate < monthStart) {
        newMembersLastMonth += 1;
      }

      const membership = latestMembershipByMember.get(String(member._id));
      const isActive =
        member.status === "active" &&
        membership &&
        membership.status === "active" &&
        new Date(membership.expiryDate) >= today;
      if (isActive) {
        activeMembers += 1;
      }
    }

    const checkInsToday = recentCheckIns.filter((item) => new Date(item.checkInTime) >= today).length;
    const checkInsYesterday = recentCheckIns.filter((item) => {
      const dt = new Date(item.checkInTime);
      return dt >= yesterday && dt < today;
    }).length;

    const outstandingPayments = payments.filter(
      (payment) => payment.status === "Pending" || payment.status === "Overdue",
    );
    const outstandingAmountEgp = outstandingPayments.reduce((sum, item) => sum + item.amount, 0);
    const collectedMonthEgp = payments
      .filter(
        (payment) =>
          (payment.status === "Paid" || payment.status === "Partial") &&
          new Date(payment.date) >= monthStart,
      )
      .reduce((sum, item) => sum + item.amount, 0);

    // Build 7-day attendance series (oldest -> today)
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    const attendanceSeries = Array.from({ length: 7 }, (_, index) => {
      const dayStart = new Date(sevenDaysAgo);
      dayStart.setDate(sevenDaysAgo.getDate() + index);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);
      const count = recentCheckIns.filter((item) => {
        const dt = new Date(item.checkInTime);
        return dt >= dayStart && dt < dayEnd;
      }).length;
      return {
        date: dayStart.toISOString().slice(0, 10),
        label: weekdayFormatter.format(dayStart),
        count,
      };
    });

    // Build real actionable "Needs attention" items
    type AttentionItem = {
      id: string;
      name: string;
      initials: string;
      note: string;
      tag: "Membership" | "Payment";
      href: string;
      priority: number;
    };
    const attentionItems: AttentionItem[] = [];

    for (const req of pendingSubRequests) {
      const m = req.memberId as unknown as { fullName?: string } | null;
      const mName = m?.fullName ?? "Mobile Member";
      attentionItems.push({
        id: `subreq-${String(req._id)}`,
        name: mName,
        initials: toInitials(mName),
        note: `New ${req.planName} request · EGP ${req.price.toLocaleString("en-US")} via ${req.paymentMethod}`,
        tag: "Membership",
        href: "/memberships",
        priority: -1,
      });
    }

    for (const member of members) {
      const id = String(member._id);
      const membership = latestMembershipByMember.get(id);
      if (!membership) continue;
      const expiry = startOfDay(new Date(membership.expiryDate));
      const daysUntilExpiry = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

      if (daysUntilExpiry < 0 && daysUntilExpiry >= -30) {
        const daysAgo = Math.abs(daysUntilExpiry);
        attentionItems.push({
          id: `exp-${id}`,
          name: member.fullName,
          initials: toInitials(member.fullName),
          note:
            daysAgo === 1
              ? `Membership expired yesterday · ${membership.planName}`
              : `Membership expired ${daysAgo} days ago · ${membership.planName}`,
          tag: "Membership",
          href: "/memberships",
          priority: 1,
        });
      } else if (daysUntilExpiry >= 0 && daysUntilExpiry <= 7) {
        attentionItems.push({
          id: `soon-${id}`,
          name: member.fullName,
          initials: toInitials(member.fullName),
          note:
            daysUntilExpiry === 0
              ? `Membership expires today · ${membership.planName}`
              : daysUntilExpiry === 1
                ? `Membership expires tomorrow · ${membership.planName}`
                : `Membership expires in ${daysUntilExpiry} days · ${membership.planName}`,
          tag: "Membership",
          href: "/memberships",
          priority: 2,
        });
      }
    }

    for (const payment of outstandingPayments.slice(0, 6)) {
      const member = memberById.get(
        (payment.memberId as Types.ObjectId).toString(),
      );
      if (!member) continue;
      attentionItems.push({
        id: `pay-${String(payment._id)}`,
        name: member.fullName,
        initials: toInitials(member.fullName),
        note: `${payment.status} payment · EGP ${payment.amount.toLocaleString("en-US")}`,
        tag: "Payment",
        href: "/payments",
        priority: payment.status === "Overdue" ? 0 : 3,
      });
    }

    attentionItems.sort((a, b) => a.priority - b.priority);

    return NextResponse.json({
      gym: {
        id: gym._id.toString(),
        name: gym.name,
        slug: gym.slug,
      },
      metrics: {
        activeMembers,
        totalMembers: members.length,
        newMembersThisMonth,
        newMembersLastMonth,
        checkInsToday,
        checkInsYesterday,
        currentlyInside,
        paymentsDueCount: outstandingPayments.length,
        outstandingAmountEgp,
        collectedMonthEgp,
      },
      attendanceSeries,
      attentionItems: attentionItems.slice(0, 6).map(({ priority: _priority, ...rest }) => {
        void _priority;
        return rest;
      }),
    });
  } catch (error) {
    console.error("Failed to load dashboard data:", error);
    return NextResponse.json(
      { error: "Unable to load dashboard metrics at this time." },
      { status: 503 },
    );
  }
}
