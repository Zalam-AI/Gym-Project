"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  Globe,
  Headphones,
  KeyRound,
  LoaderCircle,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sliders,
  Tag,
  X,
} from "lucide-react";
import { SuperAdminGymDetailsModal } from "@/components/super-admin-gym-details-modal";
import { SuperAdminPlansTab, type SaasPlanRow } from "@/components/super-admin-plans-tab";
import {
  RecordSaasPaymentModal,
  type SaasPaymentRow,
  SuperAdminSubscriptionsTab,
} from "@/components/super-admin-subscriptions-tab";
import { LanguageSwitch } from "@/lib/i18n";
import {
  clearPlatformSessionToken,
  ensurePlatformFetchPatched,
} from "@/lib/platform-client-auth";

type PlatformTab =
  | "overview"
  | "gyms"
  | "subscriptions"
  | "plans"
  | "config"
  | "activity"
  | "support";

type PlatformAdminProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
};

type PlatformGymRow = {
  id: string;
  name: string;
  slug: string;
  workspacePath?: string;
  subdomain: string;
  subdomainUrl: string;
  customDomain: string | null;
  address: string;
  phone: string;
  status: "pending" | "active" | "suspended";
  statusNote: string;
  approvedAt: string | null;
  capacity: number;
  timezone: string;
  currency: string;
  owner: {
    id: string;
    name: string;
    email: string;
    status: "active" | "inactive";
  } | null;
  platformSubscription: {
    planId?: string | null;
    planCode?: string;
    planName?: string;
    planTier: "trial" | "starter" | "growth" | "enterprise";
    billingStatus: "trialing" | "active" | "past_due" | "paused" | "canceled";
    paymentStatus?: string;
    billingCycle: "monthly" | "annual" | "custom";
    priceAmount?: number;
    monthlyRecurringAmount?: number;
    startDate?: string | null;
    expirationDate?: string | null;
    renewalDate: string | null;
    gracePeriodDays?: number;
    autoSuspendOnExpire?: boolean;
    lifecycleState?: string;
    inGracePeriod?: boolean;
    isExpired?: boolean;
    accessAllowed?: boolean;
    notes: string;
  };
  staffCount: number;
  memberCount: number;
  trainerCount: number;
  activeMembershipsCount: number;
  createdAt: string | null;
};

type PlatformSummary = {
  totalGyms: number;
  activeGyms: number;
  pendingGyms: number;
  suspendedGyms: number;
  expiredSubscriptions?: number;
  gracePeriodGyms?: number;
  totalEnrolledMembers: number;
  unaffiliatedMobileMembers: number;
  totalMembersAll?: number;
  totalStaffUsers: number;
  totalTrainers: number;
  activeMemberSubscriptions: number;
  pendingMemberRequests: number;
  checkInsLast24h: number;
  monthlyRecurringRevenue?: number;
  totalSaasRevenueCollected?: number;
  subscriptionBreakdown: {
    trialing: number;
    active: number;
    past_due: number;
    paused: number;
    canceled: number;
  };
  recentPayments?: Array<{
    id: string;
    gymId: string;
    gymName: string;
    planName: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: string;
    paidAt: string | null;
    receiptNumber: string;
  }>;
};

type PlatformConfigState = {
  selfServiceRegistration: "open" | "approval_required" | "closed";
  defaultTrialDays: number;
  defaultGymCapacity: number;
  defaultTimezone: string;
  defaultCurrency: string;
  announcementBanner: {
    enabled: boolean;
    message: string;
    severity: "info" | "warning" | "maintenance";
  };
  supportInfo: {
    supportEmail: string;
    supportPhone: string;
    supportHours: string;
    operationsNotice: string;
  };
  updatedAt: string | null;
};

type AuditLogRow = {
  id: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  summary: string;
  ipAddress: string;
  createdAt: string | null;
};

type SystemEventRow = {
  id: string;
  kind: "gym_registration" | "support_case";
  title: string;
  status: string;
  timestamp: string | null;
};

type SupportItemRow = {
  id: string;
  gymId: string | null;
  gymName: string;
  subject: string;
  category:
    | "onboarding"
    | "domain_routing"
    | "account_access"
    | "subscription"
    | "incident"
    | "general";
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved";
  contactName: string;
  contactEmail: string;
  notes: string;
  resolutionNotes: string;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const COMMON_TIMEZONES = [
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "UTC",
] as const;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PlatformDashboardPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [admin, setAdmin] = useState<PlatformAdminProfile | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformTab>("overview");
  const [, setBaseDomain] = useState("gymos.com");

  const [gyms, setGyms] = useState<PlatformGymRow[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [saasPlans, setSaasPlans] = useState<SaasPlanRow[]>([]);
  const [saasPayments, setSaasPayments] = useState<SaasPaymentRow[]>([]);
  const [paymentTotals, setPaymentTotals] = useState({
    totalCollected: 0,
    collectedThisMonth: 0,
  });
  const [detailGymId, setDetailGymId] = useState<string | null>(null);
  const [recordPaymentGymId, setRecordPaymentGymId] = useState<string | null>(null);
  const [config, setConfig] = useState<PlatformConfigState | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEventRow[]>([]);
  const [supportItems, setSupportItems] = useState<SupportItemRow[]>([]);

  const [loadingData, setLoadingData] = useState(true);
  const [bannerMsg, setBannerMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedText, setCopiedText] = useState("");

  // Filters
  const [gymSearch, setGymSearch] = useState("");
  const [gymStatusFilter, setGymStatusFilter] = useState<
    "all" | "active" | "pending" | "suspended" | "expired"
  >("all");
  const [gymPlanFilter, setGymPlanFilter] = useState<string>("all");
  const [supportFilter, setSupportFilter] = useState<"all" | "open" | "in_progress" | "resolved">(
    "all",
  );

  // Create Gym Modal
  const [showCreateGym, setShowCreateGym] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createSubdomain, setCreateSubdomain] = useState("");
  const [createCapacity, setCreateCapacity] = useState("100");
  const [createTimezone] = useState("Africa/Cairo");
  const [createStatus, setCreateStatus] = useState<"active" | "pending">("active");
  const [createPlanCode, setCreatePlanCode] = useState<string>("starter");
  const [createExpirationDate, setCreateExpirationDate] = useState("");
  const [createGraceDays, setCreateGraceDays] = useState("7");
  const [createOwnerName, setCreateOwnerName] = useState("");
  const [createOwnerEmail, setCreateOwnerEmail] = useState("");
  const [createOwnerPassword, setCreateOwnerPassword] = useState("");
  const [creatingGym, setCreatingGym] = useState(false);
  const [issuedInviteBanner, setIssuedInviteBanner] = useState<{
    gymName: string;
    code: string;
  } | null>(null);

  // Edit Gym Modal
  const [editingGym, setEditingGym] = useState<PlatformGymRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCapacity, setEditCapacity] = useState("100");
  const [editTimezone, setEditTimezone] = useState("Africa/Cairo");
  const [editSubdomain, setEditSubdomain] = useState("");
  const [editCustomDomain, setEditCustomDomain] = useState("");
  const [savingGymEdit, setSavingGymEdit] = useState(false);

  // Edit Subscription Modal
  const [subModalGym, setSubModalGym] = useState<PlatformGymRow | null>(null);
  const [subPlanCode, setSubPlanCode] = useState<string>("starter");
  const [subBillingStatus, setSubBillingStatus] = useState<
    "trialing" | "active" | "past_due" | "paused" | "canceled"
  >("trialing");
  const [subPaymentStatus, setSubPaymentStatus] = useState<string>("paid");
  const [subBillingCycle, setSubBillingCycle] = useState<"monthly" | "annual" | "custom">(
    "monthly",
  );
  const [subPriceAmount, setSubPriceAmount] = useState("");
  const [subStartDate, setSubStartDate] = useState("");
  const [subRenewalDate, setSubRenewalDate] = useState("");
  const [subGraceDays, setSubGraceDays] = useState("7");
  const [subAutoSuspend, setSubAutoSuspend] = useState(true);
  const [subNotes, setSubNotes] = useState("");
  const [savingSub, setSavingSub] = useState(false);

  // Config Form State
  const [cfgSelfService, setCfgSelfService] = useState<"open" | "approval_required" | "closed">(
    "open",
  );
  const [cfgTrialDays, setCfgTrialDays] = useState("14");
  const [cfgCapacity, setCfgCapacity] = useState("100");
  const [cfgTimezone, setCfgTimezone] = useState("Africa/Cairo");
  const [cfgCurrency, setCfgCurrency] = useState("EGP");
  const [cfgBannerEnabled, setCfgBannerEnabled] = useState(false);
  const [cfgBannerSeverity, setCfgBannerSeverity] = useState<"info" | "warning" | "maintenance">(
    "info",
  );
  const [cfgBannerMessage, setCfgBannerMessage] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Support Directory + Case Form State
  const [supEmail, setSupEmail] = useState("support@gymos.com");
  const [supPhone, setSupPhone] = useState("");
  const [supHours, setSupHours] = useState("");
  const [supNotice, setSupNotice] = useState("");
  const [savingDirectory, setSavingDirectory] = useState(false);

  const [newCaseGymId, setNewCaseGymId] = useState("");
  const [newCaseSubject, setNewCaseSubject] = useState("");
  const [newCaseCategory, setNewCaseCategory] = useState<SupportItemRow["category"]>("general");
  const [newCasePriority, setNewCasePriority] = useState<SupportItemRow["priority"]>("normal");
  const [newCaseContactName, setNewCaseContactName] = useState("");
  const [newCaseContactEmail, setNewCaseContactEmail] = useState("");
  const [newCaseNotes, setNewCaseNotes] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);

  const [busyGymId, setBusyGymId] = useState("");
  const [busySupportId, setBusySupportId] = useState("");

  const hasPerm = useCallback(
    (perm: string) => Boolean(admin?.permissions.includes(perm)),
    [admin],
  );

  const showToast = useCallback((msg: string) => {
    setBannerMsg(msg);
    window.setTimeout(() => setBannerMsg(""), 4500);
  }, []);

  const loadConsoleData = useCallback(async () => {
    setLoadingData(true);
    setErrorMsg("");
    try {
      const gymsRes = await fetch("/api/platform/gyms", { cache: "no-store" });
      if (gymsRes.status === 401 || gymsRes.status === 403) {
        clearPlatformSessionToken();
        router.replace("/platform/login");
        return;
      }
      const gymsJson = (await gymsRes.json()) as {
        error?: string;
        admin?: PlatformAdminProfile;
        baseDomain?: string;
        summary?: PlatformSummary;
        gyms?: PlatformGymRow[];
      };
      if (!gymsRes.ok || !gymsJson.admin) {
        throw new Error(gymsJson.error ?? "Unable to load platform console.");
      }

      setAdmin(gymsJson.admin);
      setBaseDomain(gymsJson.baseDomain || "gymos.com");
      setGyms(gymsJson.gyms ?? []);
      setSummary(gymsJson.summary ?? null);
      setAuthReady(true);

      const perms = new Set(gymsJson.admin.permissions);

      const [cfgRes, actRes, supRes, plansRes, payRes] = await Promise.all([
        perms.has("platform:config") || perms.has("gyms:read")
          ? fetch("/api/platform/config", { cache: "no-store" })
          : Promise.resolve(null),
        perms.has("platform:audit") || perms.has("platform:metrics")
          ? fetch("/api/platform/activity", { cache: "no-store" })
          : Promise.resolve(null),
        perms.has("platform:support") || perms.has("gyms:read")
          ? fetch("/api/platform/support", { cache: "no-store" })
          : Promise.resolve(null),
        perms.has("gyms:read")
          ? fetch("/api/platform/plans", { cache: "no-store" })
          : Promise.resolve(null),
        perms.has("gyms:read")
          ? fetch("/api/platform/payments", { cache: "no-store" })
          : Promise.resolve(null),
      ]);

      if (cfgRes && cfgRes.ok) {
        const cfgJson = (await cfgRes.json()) as { config?: PlatformConfigState };
        if (cfgJson.config) {
          setConfig(cfgJson.config);
          setCfgSelfService(cfgJson.config.selfServiceRegistration);
          setCfgTrialDays(String(cfgJson.config.defaultTrialDays));
          setCfgCapacity(String(cfgJson.config.defaultGymCapacity));
          setCfgTimezone(cfgJson.config.defaultTimezone);
          setCfgCurrency(cfgJson.config.defaultCurrency);
          setCfgBannerEnabled(cfgJson.config.announcementBanner.enabled);
          setCfgBannerSeverity(cfgJson.config.announcementBanner.severity);
          setCfgBannerMessage(cfgJson.config.announcementBanner.message);
          setSupEmail(cfgJson.config.supportInfo.supportEmail);
          setSupPhone(cfgJson.config.supportInfo.supportPhone);
          setSupHours(cfgJson.config.supportInfo.supportHours);
          setSupNotice(cfgJson.config.supportInfo.operationsNotice);
        }
      }

      if (actRes && actRes.ok) {
        const actJson = (await actRes.json()) as {
          auditLogs?: AuditLogRow[];
          systemEvents?: SystemEventRow[];
        };
        setAuditLogs(actJson.auditLogs ?? []);
        setSystemEvents(actJson.systemEvents ?? []);
      }

      if (supRes && supRes.ok) {
        const supJson = (await supRes.json()) as { items?: SupportItemRow[] };
        setSupportItems(supJson.items ?? []);
      }

      if (plansRes && plansRes.ok) {
        const plansJson = (await plansRes.json()) as { plans?: SaasPlanRow[] };
        setSaasPlans(plansJson.plans ?? []);
      }

      if (payRes && payRes.ok) {
        const payJson = (await payRes.json()) as {
          payments?: SaasPaymentRow[];
          totals?: { totalCollected: number; collectedThisMonth: number };
        };
        setSaasPayments(payJson.payments ?? []);
        if (payJson.totals) {
          setPaymentTotals(payJson.totals);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load platform data.");
    } finally {
      setLoadingData(false);
    }
  }, [router]);

  useEffect(() => {
    ensurePlatformFetchPatched();
    void loadConsoleData();
  }, [loadConsoleData]);

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedText(key);
      window.setTimeout(() => setCopiedText(""), 2200);
    } catch {
      // Ignore clipboard restrictions.
    }
  }

  async function handleLogout() {
    clearPlatformSessionToken();
    await fetch("/api/platform/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/platform/login");
    router.refresh();
  }

  async function handleSetGymStatus(
    gym: PlatformGymRow,
    nextStatus: "active" | "suspended",
  ) {
    setBusyGymId(gym.id);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-status",
          gymId: gym.id,
          status: nextStatus,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to update gym status.");
      showToast(
        nextStatus === "active"
          ? `${gym.name} is now active.`
          : `${gym.name} has been suspended.`,
      );
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to update gym status.");
    } finally {
      setBusyGymId("");
    }
  }

  async function handleIssueOwnerInvite(gym: PlatformGymRow) {
    setBusyGymId(gym.id);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue-owner-invite",
          gymId: gym.id,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        invite?: { code: string; gymName: string };
      };
      if (!res.ok || !data.invite) {
        throw new Error(data.error ?? "Unable to issue owner invite code.");
      }
      setIssuedInviteBanner({ gymName: data.invite.gymName, code: data.invite.code });
      showToast(`Issued one-time owner invite code for ${gym.name}.`);
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to issue owner invite code.");
    } finally {
      setBusyGymId("");
    }
  }

  async function handleCreateGym(event: FormEvent) {
    event.preventDefault();
    setCreatingGym(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-gym",
          name: createName,
          slug: createSlug.trim() || undefined,
          address: createAddress,
          phone: createPhone,
          subdomain: createSubdomain || undefined,
          capacity: Number(createCapacity),
          timezone: createTimezone,
          status: createStatus,
          planCode: createPlanCode,
          expirationDate: createExpirationDate || undefined,
          gracePeriodDays: Number(createGraceDays || 7),
          ...(createOwnerName || createOwnerEmail || createOwnerPassword
            ? {
                ownerName: createOwnerName,
                ownerEmail: createOwnerEmail,
                ownerPassword: createOwnerPassword,
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        gym?: { name: string; slug?: string };
        ownerInviteCode?: string | null;
      };
      if (!res.ok || !data.gym) {
        throw new Error(data.error ?? "Unable to provision gym workspace.");
      }
      if (data.ownerInviteCode) {
        setIssuedInviteBanner({ gymName: data.gym.name, code: data.ownerInviteCode });
      }
      setShowCreateGym(false);
      setCreateName("");
      setCreateSlug("");
      setCreateAddress("");
      setCreatePhone("");
      setCreateSubdomain("");
      setCreateExpirationDate("");
      setCreateOwnerName("");
      setCreateOwnerEmail("");
      setCreateOwnerPassword("");
      showToast(
        `Provisioned gym workspace "${data.gym.name}"${
          data.gym.slug ? ` at /gym/${data.gym.slug}` : ""
        }.`,
      );
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to provision gym workspace.");
    } finally {
      setCreatingGym(false);
    }
  }

  function openEditGymModal(gym: PlatformGymRow) {
    setEditingGym(gym);
    setEditName(gym.name);
    setEditSlug(gym.slug);
    setEditAddress(gym.address);
    setEditPhone(gym.phone);
    setEditCapacity(String(gym.capacity));
    setEditTimezone(gym.timezone || "Africa/Cairo");
    setEditSubdomain(gym.subdomain);
    setEditCustomDomain(gym.customDomain ?? "");
  }

  async function handleSaveGymEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingGym) return;
    setSavingGymEdit(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-gym",
          gymId: editingGym.id,
          name: editName,
          slug: editSlug,
          address: editAddress,
          phone: editPhone,
          capacity: Number(editCapacity),
          timezone: editTimezone,
          subdomain: editSubdomain,
          customDomain: editCustomDomain,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to save gym profile.");
      setEditingGym(null);
      showToast(`Updated gym profile for "${editName}".`);
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to save gym profile.");
    } finally {
      setSavingGymEdit(false);
    }
  }

  function openSubscriptionModal(gym: PlatformGymRow) {
    setSubModalGym(gym);
    setSubPlanCode(gym.platformSubscription.planCode || gym.platformSubscription.planTier);
    setSubBillingStatus(gym.platformSubscription.billingStatus);
    setSubPaymentStatus(
      gym.platformSubscription.paymentStatus ||
        (gym.platformSubscription.billingStatus === "active" ? "paid" : "trialing"),
    );
    setSubBillingCycle(gym.platformSubscription.billingCycle);
    setSubPriceAmount(
      gym.platformSubscription.priceAmount !== undefined
        ? String(gym.platformSubscription.priceAmount)
        : "",
    );
    setSubStartDate(
      gym.platformSubscription.startDate ? gym.platformSubscription.startDate.slice(0, 10) : "",
    );
    const expiryIso =
      gym.platformSubscription.expirationDate || gym.platformSubscription.renewalDate;
    setSubRenewalDate(expiryIso ? expiryIso.slice(0, 10) : "");
    setSubGraceDays(String(gym.platformSubscription.gracePeriodDays ?? 7));
    setSubAutoSuspend(gym.platformSubscription.autoSuspendOnExpire !== false);
    setSubNotes(gym.platformSubscription.notes);
  }

  async function handleSaveSubscription(event: FormEvent) {
    event.preventDefault();
    if (!subModalGym) return;
    setSavingSub(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-subscription",
          gymId: subModalGym.id,
          planCode: subPlanCode,
          planTier: ["trial", "starter", "growth", "enterprise"].includes(subPlanCode)
            ? subPlanCode
            : undefined,
          billingStatus: subBillingStatus,
          paymentStatus: subPaymentStatus,
          billingCycle: subBillingCycle,
          priceAmount: subPriceAmount !== "" ? Number(subPriceAmount) : undefined,
          startDate: subStartDate,
          expirationDate: subRenewalDate,
          renewalDate: subRenewalDate,
          gracePeriodDays: Number(subGraceDays || 0),
          autoSuspendOnExpire: subAutoSuspend,
          notes: subNotes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to save subscription record.");
      showToast(`Updated subscription & grace period for "${subModalGym.name}".`);
      setSubModalGym(null);
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to save subscription record.");
    } finally {
      setSavingSub(false);
    }
  }

  async function handleSaveConfig(event: FormEvent) {
    event.preventDefault();
    setSavingConfig(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selfServiceRegistration: cfgSelfService,
          defaultTrialDays: Number(cfgTrialDays),
          defaultGymCapacity: Number(cfgCapacity),
          defaultTimezone: cfgTimezone,
          defaultCurrency: cfgCurrency,
          announcementBanner: {
            enabled: cfgBannerEnabled,
            severity: cfgBannerSeverity,
            message: cfgBannerMessage,
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to update platform configuration.");
      showToast("Saved platform-wide configuration.");
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Unable to update platform configuration.",
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSaveSupportDirectory(event: FormEvent) {
    event.preventDefault();
    setSavingDirectory(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-directory",
          supportEmail: supEmail,
          supportPhone: supPhone,
          supportHours: supHours,
          operationsNotice: supNotice,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to update support directory.");
      showToast("Updated platform support directory.");
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to update support directory.");
    } finally {
      setSavingDirectory(false);
    }
  }

  async function handleCreateSupportCase(event: FormEvent) {
    event.preventDefault();
    setCreatingCase(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: newCaseGymId || undefined,
          subject: newCaseSubject,
          category: newCaseCategory,
          priority: newCasePriority,
          contactName: newCaseContactName,
          contactEmail: newCaseContactEmail,
          notes: newCaseNotes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to log support case.");
      setNewCaseSubject("");
      setNewCaseContactName("");
      setNewCaseContactEmail("");
      setNewCaseNotes("");
      showToast("Logged platform support case.");
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to log support case.");
    } finally {
      setCreatingCase(false);
    }
  }

  async function handleUpdateSupportStatus(
    itemId: string,
    status: SupportItemRow["status"],
  ) {
    setBusySupportId(itemId);
    setErrorMsg("");
    try {
      const res = await fetch("/api/platform/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to update support status.");
      await loadConsoleData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to update support status.");
    } finally {
      setBusySupportId("");
    }
  }

  const filteredGyms = useMemo(() => {
    const q = gymSearch.trim().toLowerCase();
    return gyms.filter((gym) => {
      if (gymStatusFilter === "expired") {
        if (!gym.platformSubscription.isExpired) return false;
      } else if (gymStatusFilter !== "all" && gym.status !== gymStatusFilter) {
        return false;
      }
      const pCode = gym.platformSubscription.planCode || gym.platformSubscription.planTier;
      if (gymPlanFilter !== "all" && pCode !== gymPlanFilter) return false;
      if (!q) return true;
      return (
        gym.name.toLowerCase().includes(q) ||
        gym.slug.toLowerCase().includes(q) ||
        gym.subdomain.toLowerCase().includes(q) ||
        (gym.phone ?? "").toLowerCase().includes(q) ||
        (gym.customDomain ?? "").toLowerCase().includes(q) ||
        (gym.owner?.email ?? "").toLowerCase().includes(q) ||
        (gym.owner?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [gyms, gymSearch, gymStatusFilter, gymPlanFilter]);

  const filteredSupport = useMemo(() => {
    return supportItems.filter((item) =>
      supportFilter === "all" ? true : item.status === supportFilter,
    );
  }, [supportItems, supportFilter]);

  const pendingGymsList = useMemo(
    () => gyms.filter((gym) => gym.status === "pending"),
    [gyms],
  );

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0f172a] text-slate-300">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <LoaderCircle size={18} className="animate-spin text-indigo-400" aria-hidden="true" />
          <span>Verifying platform administrator authorization…</span>
        </div>
      </div>
    );
  }

  const canWriteGyms = hasPerm("gyms:write");
  const canEditConfig = hasPerm("platform:config");
  const canManageSupport = hasPerm("platform:support");

  return (
    <div className="min-h-screen bg-[#f3f5f9] text-slate-900">
      {/* Top Executive Control Plane Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0f172a] text-white">
        <div className="mx-auto flex max-w-[1420px] flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-indigo-500 text-white shadow-sm">
              <Shield size={18} aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-semibold tracking-[-0.02em] text-white">
                  Leeloo Connect — Super Admin
                </span>
                <span className="rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                  {admin?.role.replace("_", " ")}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Multi-gym SaaS control plane · Individual clubs operate under{" "}
                <span className="font-mono text-slate-300">/gym/&lt;slug&gt;</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <LanguageSwitch variant="dark" />
            <button
              type="button"
              onClick={() => void loadConsoleData()}
              disabled={loadingData}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            >
              <RefreshCw
                size={13}
                className={loadingData ? "animate-spin" : ""}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
            <div className="hidden border-s border-slate-800 ps-3 text-end sm:block">
              <p className="text-xs font-semibold text-slate-100">{admin?.name}</p>
              <p className="text-[10px] text-slate-400">{admin?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <LogOut size={13} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto max-w-[1420px] px-5 sm:px-8">
          <nav
            aria-label="Platform console sections"
            className="flex gap-1 overflow-x-auto pb-2"
          >
            {(
              [
                { id: "overview", label: "Overview", icon: Activity },
                { id: "gyms", label: `Gyms (${gyms.length})`, icon: Building2 },
                {
                  id: "subscriptions",
                  label: `Subscriptions & Payments`,
                  icon: CreditCard,
                },
                {
                  id: "plans",
                  label: `Plans & Pricing (${saasPlans.length || 4})`,
                  icon: Tag,
                },
                { id: "config", label: "Platform Config", icon: Sliders },
                { id: "activity", label: "Audit & Activity", icon: Settings },
                {
                  id: "support",
                  label: `Support (${supportItems.filter((i) => i.status !== "resolved").length})`,
                  icon: Headphones,
                },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1420px] space-y-6 p-5 sm:p-8">
        {bannerMsg && (
          <div
            role="status"
            className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />
              {bannerMsg}
            </span>
            <button
              type="button"
              onClick={() => setBannerMsg("")}
              className="text-emerald-700 hover:text-emerald-950"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {issuedInviteBanner && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-950">
            <div>
              <p className="font-semibold">
                One-time Owner Invitation Code for {issuedInviteBanner.gymName}
              </p>
              <p className="mt-0.5 text-[11px] text-indigo-800">
                Share this code with the gym owner to claim owner access on `/register`:{" "}
                <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-indigo-950">
                  {issuedInviteBanner.code}
                </code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyValue("owner-invite", issuedInviteBanner.code)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100"
              >
                {copiedText === "owner-invite" ? <Check size={13} /> : <Copy size={13} />}
                {copiedText === "owner-invite" ? "Copied" : "Copy Code"}
              </button>
              <button
                type="button"
                onClick={() => setIssuedInviteBanner(null)}
                className="rounded-lg p-1 text-indigo-700 hover:bg-indigo-100"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
          >
            {errorMsg}
          </div>
        )}

        {/* TAB 1: OVERVIEW & PLATFORM STATISTICS */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {summary ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <p className="text-xs font-medium text-slate-500">Total Registered Gyms</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{summary.totalGyms}</p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {summary.pendingGyms} pending approval
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <p className="text-xs font-medium text-slate-500">Active Gyms</p>
                    <p className="mt-2 text-3xl font-bold text-emerald-700">{summary.activeGyms}</p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {summary.checkInsLast24h} check-ins in last 24h
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <p className="text-xs font-medium text-slate-500">Suspended Gyms</p>
                    <p className="mt-2 text-3xl font-bold text-rose-700">
                      {summary.suspendedGyms}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      Access blocked at gateway
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <p className="text-xs font-medium text-slate-500">Expired Subscriptions</p>
                    <p className="mt-2 text-3xl font-bold text-amber-700">
                      {summary.expiredSubscriptions ?? 0}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {summary.gracePeriodGyms ?? 0} currently in grace period
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <p className="text-xs font-medium text-slate-500">Total Members</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {summary.totalMembersAll ??
                        summary.totalEnrolledMembers + summary.unaffiliatedMobileMembers}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {summary.totalEnrolledMembers} enrolled · {summary.unaffiliatedMobileMembers}{" "}
                      mobile
                    </p>
                  </div>

                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-2xs">
                    <p className="text-xs font-semibold text-indigo-900">
                      Monthly Recurring Revenue
                    </p>
                    <p className="mt-2 text-2xl font-bold text-indigo-950">
                      {new Intl.NumberFormat("en-EG", {
                        style: "currency",
                        currency: "EGP",
                        maximumFractionDigits: 0,
                      }).format(summary.monthlyRecurringRevenue ?? 0)}
                    </p>
                    <p className="mt-2 text-[11px] text-indigo-800">
                      Collected:{" "}
                      {new Intl.NumberFormat("en-EG", {
                        style: "currency",
                        currency: "EGP",
                        maximumFractionDigits: 0,
                      }).format(summary.totalSaasRevenueCollected ?? 0)}
                    </p>
                  </div>
                </div>

                {/* Manual SaaS Subscription Breakdown */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Gym SaaS Subscription Status Overview
                      </h2>
                      <p className="text-xs text-slate-500">
                        Manual platform subscription records — no external payment processor is
                        connected.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("gyms")}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      Manage gym subscriptions →
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {(
                      [
                        {
                          label: "Trialing",
                          value: summary.subscriptionBreakdown.trialing,
                          tone: "bg-sky-50 text-sky-800 border-sky-200",
                        },
                        {
                          label: "Active",
                          value: summary.subscriptionBreakdown.active,
                          tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
                        },
                        {
                          label: "Past Due",
                          value: summary.subscriptionBreakdown.past_due,
                          tone: "bg-amber-50 text-amber-800 border-amber-200",
                        },
                        {
                          label: "Paused",
                          value: summary.subscriptionBreakdown.paused,
                          tone: "bg-slate-100 text-slate-700 border-slate-200",
                        },
                        {
                          label: "Canceled",
                          value: summary.subscriptionBreakdown.canceled,
                          tone: "bg-rose-50 text-rose-800 border-rose-200",
                        },
                      ] as const
                    ).map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-xl border px-3.5 py-3 ${item.tone}`}
                      >
                        <p className="text-[11px] font-medium">{item.label}</p>
                        <p className="mt-1 text-xl font-bold">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-600">
                Platform-wide metrics require the <code>platform:metrics</code> permission.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Pending Approvals Queue */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <h2 className="text-sm font-semibold text-slate-900">
                  Pending Gym Approvals ({pendingGymsList.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Workspaces awaiting platform approval when registration policy requires review.
                </p>

                {pendingGymsList.length === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                    No gyms are currently awaiting approval.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {pendingGymsList.map((gym) => (
                      <li
                        key={gym.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{gym.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {gym.address} · {gym.owner?.email ?? "No owner yet"}
                          </p>
                        </div>
                        {canWriteGyms && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyGymId === gym.id}
                              onClick={() => void handleSetGymStatus(gym, "active")}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                            >
                              <Check size={13} />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyGymId === gym.id}
                              onClick={() => void handleSetGymStatus(gym, "suspended")}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Suspend
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recent Audit Preview */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Recent Administrative Actions
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Latest privileged actions logged on the platform.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("activity")}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                  >
                    Full log →
                  </button>
                </div>

                {auditLogs.length === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                    No audit entries recorded yet.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {auditLogs.slice(0, 6).map((entry) => (
                      <li key={entry.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                            {entry.action}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-700">{entry.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GYMS & SUBSCRIPTIONS */}
        {activeTab === "gyms" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative min-w-[230px] flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    value={gymSearch}
                    onChange={(e) => setGymSearch(e.target.value)}
                    placeholder="Search gym name, subdomain, custom domain, or owner email…"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pe-3 ps-9 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                  {(["all", "active", "pending", "suspended", "expired"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setGymStatusFilter(st)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold capitalize transition ${
                        gymStatusFilter === st
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Filter by SaaS plan"
                  value={gymPlanFilter}
                  onChange={(e) => setGymPlanFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700"
                >
                  <option value="all">All Plans</option>
                  {saasPlans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {canWriteGyms && (
                <button
                  type="button"
                  onClick={() => setShowCreateGym((prev) => !prev)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <Plus size={15} aria-hidden="true" />
                  <span>Create Gym Account</span>
                </button>
              )}
            </div>

            {/* Create Gym Drawer / Panel */}
            {showCreateGym && canWriteGyms && (
              <form
                onSubmit={handleCreateGym}
                className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Provision New Gym Workspace
                    </h2>
                    <p className="text-xs text-slate-500">
                      Creates an isolated gym tenant with starter membership plans and either a
                      direct owner login or a one-time owner invite code.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateGym(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">Gym Name</span>
                    <input
                      required
                      maxLength={100}
                      value={createName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCreateName(val);
                        if (!createSlug) {
                          // Preview auto-slug naturally
                        }
                      }}
                      placeholder="e.g. Iron House"
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Workspace URL Slug
                    </span>
                    <div className="flex h-10 overflow-hidden rounded-xl border border-slate-300">
                      <span className="flex items-center border-r border-slate-200 bg-slate-50 px-2 font-mono text-[11px] text-slate-500">
                        /gym/
                      </span>
                      <input
                        maxLength={64}
                        value={createSlug}
                        onChange={(e) =>
                          setCreateSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "")
                              .replace(/-+/g, "-"),
                          )
                        }
                        placeholder={
                          createName
                            ? createName
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/^-+|-+$/g, "") || "auto-slug"
                            : "auto-slug"
                        }
                        className="min-w-0 flex-1 px-2.5 font-mono text-xs outline-none"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Address / City
                    </span>
                    <input
                      required
                      maxLength={200}
                      value={createAddress}
                      onChange={(e) => setCreateAddress(e.target.value)}
                      placeholder="New Cairo, Egypt"
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">Phone</span>
                    <input
                      required
                      maxLength={30}
                      value={createPhone}
                      onChange={(e) => setCreatePhone(e.target.value)}
                      placeholder="+201001234567"
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-6">
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      SaaS Subscription Plan
                    </span>
                    <select
                      value={createPlanCode}
                      onChange={(e) => setCreatePlanCode(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      {(saasPlans.length > 0
                        ? saasPlans.filter((p) => p.isActive)
                        : [
                            { code: "trial", name: "Free Trial", monthlyPrice: 0 },
                            { code: "starter", name: "Starter Club", monthlyPrice: 1800 },
                            { code: "growth", name: "Growth Pro", monthlyPrice: 3800 },
                            { code: "enterprise", name: "Enterprise Unlimited", monthlyPrice: 7500 },
                          ]
                      ).map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name} ({p.monthlyPrice} EGP/mo)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Expiration Date
                    </span>
                    <input
                      type="date"
                      value={createExpirationDate}
                      onChange={(e) => setCreateExpirationDate(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-2.5 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Grace (Days)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={createGraceDays}
                      onChange={(e) => setCreateGraceDays(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">Capacity</span>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      required
                      value={createCapacity}
                      onChange={(e) => setCreateCapacity(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Initial Status
                    </span>
                    <select
                      value={createStatus}
                      onChange={(e) => setCreateStatus(e.target.value as "active" | "pending")}
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending Approval</option>
                    </select>
                  </label>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-800">
                    Initial Gym Owner Account (Optional — leave blank to generate a one-time Owner
                    Invite Code)
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <input
                      value={createOwnerName}
                      onChange={(e) => setCreateOwnerName(e.target.value)}
                      placeholder="Owner full name"
                      className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs"
                    />
                    <input
                      type="email"
                      value={createOwnerEmail}
                      onChange={(e) => setCreateOwnerEmail(e.target.value)}
                      placeholder="owner@gym.com"
                      className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs"
                    />
                    <input
                      type="password"
                      minLength={10}
                      value={createOwnerPassword}
                      onChange={(e) => setCreateOwnerPassword(e.target.value)}
                      placeholder="Initial password (min 10 chars)"
                      className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateGym(false)}
                    className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingGym}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {creatingGym && <LoaderCircle size={14} className="animate-spin" />}
                    <span>Provision Gym</span>
                  </button>
                </div>
              </form>
            )}

            {/* Gyms Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Gym &amp; Domains</th>
                      <th className="px-4 py-3.5">Owner</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">SaaS Subscription (Manual)</th>
                      <th className="px-4 py-3.5">Usage</th>
                      <th className="px-4 py-3.5 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGyms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                          No registered gyms match your current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredGyms.map((gym) => (
                        <tr key={gym.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setDetailGymId(gym.id)}
                              className="text-start font-semibold text-slate-900 hover:text-indigo-600"
                            >
                              {gym.name}
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <a
                                href={gym.workspacePath || `/gym/${gym.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-indigo-700 hover:underline"
                              >
                                <Globe size={11} />
                                /gym/{gym.slug}
                                <ExternalLink size={10} />
                              </a>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {gym.address} · {gym.phone}
                            </p>
                          </td>

                          <td className="px-4 py-3.5">
                            {gym.owner ? (
                              <div>
                                <p className="font-medium text-slate-800">{gym.owner.name}</p>
                                <p className="text-[11px] text-slate-500">{gym.owner.email}</p>
                              </div>
                            ) : (
                              <span className="text-[11px] italic text-slate-400">
                                Unclaimed (use Owner Invite)
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                                gym.status === "active"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : gym.status === "pending"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {gym.status}
                            </span>
                            <p className="mt-1 text-[10px] text-slate-400">
                              Created {formatShortDate(gym.createdAt)}
                            </p>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                                {gym.platformSubscription.planName ||
                                  gym.platformSubscription.planTier.toUpperCase()}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                                  gym.platformSubscription.isExpired
                                    ? "bg-rose-100 text-rose-800"
                                    : gym.platformSubscription.inGracePeriod
                                      ? "bg-amber-100 text-amber-800"
                                      : gym.platformSubscription.billingStatus === "active"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : gym.platformSubscription.billingStatus === "trialing"
                                          ? "bg-sky-50 text-sky-700"
                                          : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {(
                                  gym.platformSubscription.lifecycleState ||
                                  gym.platformSubscription.billingStatus
                                ).replace("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] text-slate-500">
                              Expires:{" "}
                              {formatShortDate(
                                gym.platformSubscription.expirationDate ??
                                  gym.platformSubscription.renewalDate,
                              )}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-[11px] text-slate-600">
                            <p>{gym.memberCount} members</p>
                            <p>
                              {gym.staffCount} staff · {gym.trainerCount} coaches
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-end">
                            <div className="inline-flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDetailGymId(gym.id)}
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Eye size={12} />
                                Details
                              </button>
                              <a
                                href={gym.workspacePath || `/gym/${gym.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                Open
                                <ExternalLink size={11} />
                              </a>
                              {canWriteGyms && (
                                <>
                                  {gym.status !== "active" ? (
                                    <button
                                      type="button"
                                      disabled={busyGymId === gym.id}
                                      onClick={() => void handleSetGymStatus(gym, "active")}
                                      className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                                    >
                                      <PlayCircle size={12} />
                                      {gym.status === "pending" ? "Approve" : "Activate"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busyGymId === gym.id}
                                      onClick={() => void handleSetGymStatus(gym, "suspended")}
                                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                    >
                                      <PauseCircle size={12} />
                                      Suspend
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => openEditGymModal(gym)}
                                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <Edit3 size={12} />
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setRecordPaymentGymId(gym.id)}
                                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    <CreditCard size={12} />
                                    Payment
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openSubscriptionModal(gym)}
                                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Plan
                                  </button>

                                  <button
                                    type="button"
                                    disabled={busyGymId === gym.id}
                                    onClick={() => void handleIssueOwnerInvite(gym)}
                                    title="Generate one-time Owner Invite Code"
                                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <KeyRound size={12} />
                                    Owner Code
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2B: SUBSCRIPTIONS & MANUAL PAYMENTS */}
        {activeTab === "subscriptions" && (
          <SuperAdminSubscriptionsTab
            gyms={gyms.map((g) => ({
              id: g.id,
              name: g.name,
              slug: g.slug,
              workspacePath: g.workspacePath || `/gym/${g.slug}`,
              status: g.status,
              currency: g.currency,
              platformSubscription: {
                planId: g.platformSubscription.planId,
                planCode: g.platformSubscription.planCode,
                planName: g.platformSubscription.planName,
                planTier: g.platformSubscription.planTier,
                billingStatus: g.platformSubscription.billingStatus,
                paymentStatus: g.platformSubscription.paymentStatus,
                billingCycle: g.platformSubscription.billingCycle,
                priceAmount: g.platformSubscription.priceAmount,
                monthlyRecurringAmount: g.platformSubscription.monthlyRecurringAmount,
                startDate: g.platformSubscription.startDate,
                expirationDate: g.platformSubscription.expirationDate,
                renewalDate: g.platformSubscription.renewalDate,
                gracePeriodDays: g.platformSubscription.gracePeriodDays,
                lifecycleState: g.platformSubscription.lifecycleState,
                inGracePeriod: g.platformSubscription.inGracePeriod,
                isExpired: g.platformSubscription.isExpired,
                accessAllowed: g.platformSubscription.accessAllowed,
                notes: g.platformSubscription.notes,
              },
            }))}
            payments={saasPayments}
            totalCollected={paymentTotals.totalCollected}
            collectedThisMonth={paymentTotals.collectedThisMonth}
            mrr={summary?.monthlyRecurringRevenue ?? 0}
            canWrite={Boolean(canWriteGyms)}
            onOpenRecordPayment={(gId) => setRecordPaymentGymId(gId || gyms[0]?.id || "new")}
            onOpenManageSubscription={(id: string) => {
              const found = gyms.find((x) => x.id === id);
              if (found) openSubscriptionModal(found);
            }}
            onOpenGymDetails={(id: string) => setDetailGymId(id)}
            onToggleGymStatus={async (id: string, nextStatus: "active" | "suspended") => {
              const found = gyms.find((x) => x.id === id);
              if (found) await handleSetGymStatus(found, nextStatus);
            }}
          />
        )}

        {/* TAB 2C: PLANS & PRICING */}
        {activeTab === "plans" && (
          <SuperAdminPlansTab
            plans={saasPlans}
            canWrite={Boolean(canWriteGyms)}
            onRefresh={loadConsoleData}
            onToast={showToast}
            onError={setErrorMsg}
          />
        )}

        {/* TAB 3: PLATFORM CONFIGURATION */}
        {activeTab === "config" && (
          <form
            onSubmit={handleSaveConfig}
            className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs"
          >
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Platform-Level Governance &amp; Defaults
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Controls self-service gym onboarding policy, default tenant parameters, and
                platform-wide operational notices.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-slate-700">
                  Self-Service Gym Registration Policy
                </span>
                <select
                  disabled={!canEditConfig}
                  value={cfgSelfService}
                  onChange={(e) =>
                    setCfgSelfService(
                      e.target.value as "open" | "approval_required" | "closed",
                    )
                  }
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs disabled:bg-slate-50"
                >
                  <option value="open">
                    Open — New gyms activate immediately on registration
                  </option>
                  <option value="approval_required">
                    Approval Required — New gyms enter Pending status until approved here
                  </option>
                  <option value="closed">
                    Closed — Only platform administrators can create new gyms
                  </option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-700">
                  Default Trial Duration (Days)
                </span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  disabled={!canEditConfig}
                  value={cfgTrialDays}
                  onChange={(e) => setCfgTrialDays(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs disabled:bg-slate-50"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-700">
                  Default Gym Floor Capacity
                </span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  disabled={!canEditConfig}
                  value={cfgCapacity}
                  onChange={(e) => setCfgCapacity(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs disabled:bg-slate-50"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-700">
                  Default Timezone
                </span>
                <select
                  disabled={!canEditConfig}
                  value={cfgTimezone}
                  onChange={(e) => setCfgTimezone(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs disabled:bg-slate-50"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-700">
                  Default Currency Code
                </span>
                <input
                  maxLength={8}
                  disabled={!canEditConfig}
                  value={cfgCurrency}
                  onChange={(e) => setCfgCurrency(e.target.value.toUpperCase())}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-50"
                />
              </label>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  disabled={!canEditConfig}
                  checked={cfgBannerEnabled}
                  onChange={(e) => setCfgBannerEnabled(e.target.checked)}
                  className="size-4 rounded accent-indigo-600"
                />
                Enable Platform Operational Notice
              </label>
              <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                <select
                  disabled={!canEditConfig}
                  value={cfgBannerSeverity}
                  onChange={(e) =>
                    setCfgBannerSeverity(e.target.value as "info" | "warning" | "maintenance")
                  }
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="maintenance">Maintenance</option>
                </select>
                <input
                  maxLength={280}
                  disabled={!canEditConfig}
                  value={cfgBannerMessage}
                  onChange={(e) => setCfgBannerMessage(e.target.value)}
                  placeholder="Scheduled maintenance window or platform notice…"
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs"
                />
              </div>
            </div>

            {config?.updatedAt && (
              <p className="text-[11px] text-slate-400">
                Last updated: {formatDateTime(config.updatedAt)}
              </p>
            )}

            {canEditConfig && (
              <button
                type="submit"
                disabled={savingConfig}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {savingConfig && <LoaderCircle size={14} className="animate-spin" />}
                <span>Save Platform Configuration</span>
              </button>
            )}
          </form>
        )}

        {/* TAB 4: SYSTEM ACTIVITY & AUDIT LOG */}
        {activeTab === "activity" && (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <h2 className="text-sm font-semibold text-slate-900">
                Platform Administrative Audit Log
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Immutable chronological trail of privileged platform operations.
              </p>

              {auditLogs.length === 0 ? (
                <p className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                  No administrative audit events recorded yet.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <li key={log.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-800">
                            {log.action}
                          </span>
                          {log.targetLabel && (
                            <span className="text-xs font-semibold text-slate-800">
                              {log.targetLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700">{log.summary}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Actor: {log.actorName} ({log.actorEmail} · {log.actorRole}) · IP:{" "}
                        {log.ipAddress || "unknown"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <h2 className="text-sm font-semibold text-slate-900">Recent System Events</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Tenant registrations and active support escalations.
              </p>

              {systemEvents.length === 0 ? (
                <p className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                  No recent system events.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {systemEvents.map((ev) => (
                    <li key={ev.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                          {ev.kind === "gym_registration" ? "Gym Tenant" : "Support"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(ev.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-800">{ev.title}</p>
                      <p className="mt-0.5 text-[11px] capitalize text-slate-500">
                        Status: {ev.status}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SUPPORT & OPERATIONS */}
        {activeTab === "support" && (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              {/* Support Contact Directory */}
              <form
                onSubmit={handleSaveSupportDirectory}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Platform Support Contact Directory
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Published escalation channels and operational guidance for gym owners.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Support Email
                    </span>
                    <input
                      type="email"
                      required
                      disabled={!canManageSupport}
                      value={supEmail}
                      onChange={(e) => setSupEmail(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      Support Phone / WhatsApp
                    </span>
                    <input
                      disabled={!canManageSupport}
                      value={supPhone}
                      onChange={(e) => setSupPhone(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs disabled:bg-slate-50"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Operating Hours
                  </span>
                  <input
                    disabled={!canManageSupport}
                    value={supHours}
                    onChange={(e) => setSupHours(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs disabled:bg-slate-50"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Operations &amp; Domain Setup Guidance
                  </span>
                  <textarea
                    rows={3}
                    disabled={!canManageSupport}
                    value={supNotice}
                    onChange={(e) => setSupNotice(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs disabled:bg-slate-50"
                  />
                </label>

                {canManageSupport && (
                  <button
                    type="submit"
                    disabled={savingDirectory}
                    className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {savingDirectory && <LoaderCircle size={13} className="animate-spin" />}
                    <span>Save Support Directory</span>
                  </button>
                )}
              </form>

              {/* Log New Support Case */}
              {canManageSupport && (
                <form
                  onSubmit={handleCreateSupportCase}
                  className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Log Tenant Support Case
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Track onboarding requests, custom-domain verification, or account issues.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700">Subject</span>
                    <input
                      required
                      maxLength={160}
                      value={newCaseSubject}
                      onChange={(e) => setNewCaseSubject(e.target.value)}
                      placeholder="e.g. Custom domain DNS verification for Iron House"
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700">Gym</span>
                      <select
                        value={newCaseGymId}
                        onChange={(e) => setNewCaseGymId(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs"
                      >
                        <option value="">Platform-wide</option>
                        {gyms.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700">
                        Category
                      </span>
                      <select
                        value={newCaseCategory}
                        onChange={(e) =>
                          setNewCaseCategory(e.target.value as SupportItemRow["category"])
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs"
                      >
                        <option value="onboarding">Onboarding</option>
                        <option value="domain_routing">Domain Routing</option>
                        <option value="account_access">Account Access</option>
                        <option value="subscription">Subscription</option>
                        <option value="incident">Incident</option>
                        <option value="general">General</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700">
                        Priority
                      </span>
                      <select
                        value={newCasePriority}
                        onChange={(e) =>
                          setNewCasePriority(e.target.value as SupportItemRow["priority"])
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={newCaseContactName}
                      onChange={(e) => setNewCaseContactName(e.target.value)}
                      placeholder="Contact name (optional)"
                      className="h-10 rounded-xl border border-slate-300 px-3 text-xs"
                    />
                    <input
                      type="email"
                      value={newCaseContactEmail}
                      onChange={(e) => setNewCaseContactEmail(e.target.value)}
                      placeholder="Contact email (optional)"
                      className="h-10 rounded-xl border border-slate-300 px-3 text-xs"
                    />
                  </div>

                  <textarea
                    rows={3}
                    value={newCaseNotes}
                    onChange={(e) => setNewCaseNotes(e.target.value)}
                    placeholder="Operational notes or requested action…"
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs"
                  />

                  <button
                    type="submit"
                    disabled={creatingCase}
                    className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {creatingCase && <LoaderCircle size={13} className="animate-spin" />}
                    <span>Log Support Case</span>
                  </button>
                </form>
              )}
            </div>

            {/* Support Queue */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Support Cases</h2>
                  <p className="text-xs text-slate-500">
                    Active and resolved tenant support items.
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                  {(["all", "open", "in_progress", "resolved"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSupportFilter(st)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize ${
                        supportFilter === st
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      {st.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {filteredSupport.length === 0 ? (
                <p className="mt-6 rounded-xl bg-slate-50 px-4 py-10 text-center text-xs text-slate-500">
                  No support cases match this filter.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {filteredSupport.map((item) => (
                    <li key={item.id} className="space-y-2 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              item.priority === "urgent"
                                ? "bg-rose-100 text-rose-800"
                                : item.priority === "high"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {item.priority}
                          </span>
                          <span className="font-semibold text-slate-900 text-xs">
                            {item.subject}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${
                            item.status === "resolved"
                              ? "bg-emerald-50 text-emerald-700"
                              : item.status === "in_progress"
                                ? "bg-indigo-50 text-indigo-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.status.replace("_", " ")}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        {item.gymName || "Platform-wide"} · Category:{" "}
                        {item.category.replace("_", " ")}
                        {item.contactEmail ? ` · ${item.contactEmail}` : ""}
                      </p>

                      {item.notes && <p className="text-xs text-slate-700">{item.notes}</p>}

                      {canManageSupport && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {item.status !== "in_progress" && (
                            <button
                              type="button"
                              disabled={busySupportId === item.id}
                              onClick={() =>
                                void handleUpdateSupportStatus(item.id, "in_progress")
                              }
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Mark In Progress
                            </button>
                          )}
                          {item.status !== "resolved" && (
                            <button
                              type="button"
                              disabled={busySupportId === item.id}
                              onClick={() => void handleUpdateSupportStatus(item.id, "resolved")}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                            >
                              Resolve
                            </button>
                          )}
                          {item.status === "resolved" && (
                            <button
                              type="button"
                              disabled={busySupportId === item.id}
                              onClick={() => void handleUpdateSupportStatus(item.id, "open")}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Edit Gym Account & Domains Modal */}
      {editingGym && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/55 p-4"
          onClick={() => setEditingGym(null)}
        >
          <form
            onSubmit={handleSaveGymEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Edit Gym Account — {editingGym.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingGym(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Gym Name</span>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Workspace Slug (/gym/&lt;slug&gt;)
                </span>
                <input
                  required
                  value={editSlug}
                  onChange={(e) =>
                    setEditSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .replace(/-+/g, "-"),
                    )
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 font-mono text-xs"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Address</span>
                <input
                  required
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Phone</span>
                <input
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Subdomain</span>
                <input
                  required
                  value={editSubdomain}
                  onChange={(e) =>
                    setEditSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Custom Domain (Optional)
                </span>
                <input
                  value={editCustomDomain}
                  onChange={(e) => setEditCustomDomain(e.target.value.toLowerCase().trim())}
                  placeholder="portal.gymdomain.com"
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 font-mono text-xs"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Capacity</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  required
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Timezone</span>
                <select
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingGym(null)}
                className="min-h-9 rounded-xl border border-slate-300 px-4 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingGymEdit}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {savingGymEdit && <LoaderCircle size={13} className="animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual SaaS Subscription Status Modal */}
      {subModalGym && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/55 p-4"
          onClick={() => setSubModalGym(null)}
        >
          <form
            onSubmit={handleSaveSubscription}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                SaaS Subscription — {subModalGym.name}
              </h3>
              <button
                type="button"
                onClick={() => setSubModalGym(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              Manual SaaS subscription governance. No live payment gateway is connected — use{" "}
              <strong>Record Payment</strong> to log receipts and extend renewal dates.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">SaaS Plan</span>
                <select
                  value={subPlanCode}
                  onChange={(e) => setSubPlanCode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
                >
                  {(saasPlans.length > 0
                    ? saasPlans
                    : [
                        { code: "trial", name: "Free Trial" },
                        { code: "starter", name: "Starter Club" },
                        { code: "growth", name: "Growth Pro" },
                        { code: "enterprise", name: "Enterprise Unlimited" },
                      ]
                  ).map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Billing Status
                </span>
                <select
                  value={subBillingStatus}
                  onChange={(e) =>
                    setSubBillingStatus(
                      e.target.value as
                        | "trialing"
                        | "active"
                        | "past_due"
                        | "paused"
                        | "canceled",
                    )
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
                >
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="paused">Paused</option>
                  <option value="canceled">Canceled</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Billing Cycle</span>
                <select
                  value={subBillingCycle}
                  onChange={(e) =>
                    setSubBillingCycle(e.target.value as "monthly" | "annual" | "custom")
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Payment Status
                </span>
                <select
                  value={subPaymentStatus}
                  onChange={(e) => setSubPaymentStatus(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
                >
                  <option value="paid">Paid</option>
                  <option value="trialing">Trialing</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                  <option value="waived">Waived</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Cycle Price (EGP)
                </span>
                <input
                  type="number"
                  min={0}
                  value={subPriceAmount}
                  onChange={(e) => setSubPriceAmount(e.target.value)}
                  placeholder="Plan default"
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Start Date</span>
                <input
                  type="date"
                  value={subStartDate}
                  onChange={(e) => setSubStartDate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-2.5 text-xs"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Expiration Date
                </span>
                <input
                  type="date"
                  value={subRenewalDate}
                  onChange={(e) => setSubRenewalDate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-2.5 text-xs"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Grace Period (Days)
                </span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={subGraceDays}
                  onChange={(e) => setSubGraceDays(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={subAutoSuspend}
                onChange={(e) => setSubAutoSuspend(e.target.checked)}
                className="rounded border-slate-300"
              />
              Restrict gym access automatically after expiration + grace period elapses
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Internal Contract / Invoice Notes
              </span>
              <textarea
                rows={2}
                maxLength={300}
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                placeholder="e.g. Manual bank transfer confirmed through Q4"
                className="w-full rounded-xl border border-slate-300 p-3 text-xs"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSubModalGym(null)}
                className="min-h-9 rounded-xl border border-slate-300 px-4 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSub}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {savingSub && <LoaderCircle size={13} className="animate-spin" />}
                Save Subscription Status
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Individual Gym Details Slide-Over Drawer */}
      <SuperAdminGymDetailsModal
        gymId={detailGymId}
        canWrite={Boolean(canWriteGyms)}
        onClose={() => setDetailGymId(null)}
        onOpenRecordPayment={(gId: string) => {
          setDetailGymId(null);
          setRecordPaymentGymId(gId);
        }}
        onOpenManageSubscription={(gId: string) => {
          setDetailGymId(null);
          const found = gyms.find((x) => x.id === gId);
          if (found) openSubscriptionModal(found);
        }}
        onToggleStatus={async (gId: string, nextStatus: "active" | "suspended") => {
          const found = gyms.find((x) => x.id === gId);
          if (found) await handleSetGymStatus(found, nextStatus);
        }}
      />

      {/* Global Record Manual Payment Modal */}
      <RecordSaasPaymentModal
        open={Boolean(recordPaymentGymId)}
        gyms={gyms.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          workspacePath: g.workspacePath || `/gym/${g.slug}`,
          status: g.status,
          currency: g.currency,
          platformSubscription: {
            planId: g.platformSubscription.planId,
            planCode: g.platformSubscription.planCode,
            planName: g.platformSubscription.planName,
            planTier: g.platformSubscription.planTier,
            billingStatus: g.platformSubscription.billingStatus,
            paymentStatus: g.platformSubscription.paymentStatus,
            billingCycle: g.platformSubscription.billingCycle,
            priceAmount: g.platformSubscription.priceAmount,
            monthlyRecurringAmount: g.platformSubscription.monthlyRecurringAmount,
            startDate: g.platformSubscription.startDate,
            expirationDate: g.platformSubscription.expirationDate,
            renewalDate: g.platformSubscription.renewalDate,
            gracePeriodDays: g.platformSubscription.gracePeriodDays,
            lifecycleState: g.platformSubscription.lifecycleState,
            inGracePeriod: g.platformSubscription.inGracePeriod,
            isExpired: g.platformSubscription.isExpired,
            accessAllowed: g.platformSubscription.accessAllowed,
            notes: g.platformSubscription.notes,
          },
        }))}
        plans={saasPlans}
        initialGymId={recordPaymentGymId && recordPaymentGymId !== "new" ? recordPaymentGymId : ""}
        onClose={() => setRecordPaymentGymId(null)}
        onSuccess={async (msg: string) => {
          showToast(msg);
          await loadConsoleData();
        }}
        onError={setErrorMsg}
      />
    </div>
  );
}
