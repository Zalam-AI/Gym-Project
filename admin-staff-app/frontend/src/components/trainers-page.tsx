"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  KeyRound,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type Exercise = {
  id: number;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  muscle: string;
};

type WorkoutPlan = {
  id: string;
  title: string;
  goal: string;
  exercises: Exercise[];
  assignedMemberIds: string[];
  assignedMemberNames: string[];
};

type AvailabilitySlot = {
  day: string;
  startTime: string;
  endTime: string;
};

type Trainer = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  phone: string;
  email?: string;
  hasAppAccount?: boolean;
  inviteCode?: string;
  availability?: AvailabilitySlot[];
  upcomingSessionsCount?: number;
  assignedMemberIds: string[];
  assignedMemberNames: string[];
};

type TrainerInvite = {
  id: string;
  code: string;
  status: "unused" | "claimed" | "revoked";
  presetName: string;
  presetSpecialty: string;
  presetPhone: string;
  trainerId: string;
  claimedByName: string;
  claimedAt: string | null;
  createdAt: string | null;
};

type CoachingSession = {
  id: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled";
  notes: string;
};

type MemberAssignment = {
  id: string;
  memberId: string;
  memberName: string;
  trainerId: string | null;
  planId: string | null;
  pendingPlanId: string | null;
};

type PendingWorkoutAssignment = {
  memberId: string;
  memberName: string;
  workoutPlanId: string;
  assignedBy: string;
  assignedAt: string | null;
};

type Member = { id: string; name: string; phone?: string };

const muscleGroups = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Core",
  "Full body",
  "Cardio",
];
const trainerColors = [
  "bg-[#e9f2ff] text-[#4d73b8]",
  "bg-[#f3eefe] text-[#8c62b4]",
  "bg-[#fff0e8] text-[#c77c4a]",
];

function formatSessionDateTime(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}

function summarizeAvailability(slots?: AvailabilitySlot[]) {
  if (!slots || slots.length === 0) return "Flexible schedule";
  const days = slots.map((s) => s.day);
  const firstSlot = slots[0];
  if (slots.length >= 4) {
    return `${days[0]}–${days[days.length - 1]} · ${firstSlot.startTime}–${firstSlot.endTime}`;
  }
  return `${days.join(", ")} · ${firstSlot.startTime}–${firstSlot.endTime}`;
}

function defaultTomorrowLocalInput() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  dt.setHours(17, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

type ModalFrameProps = {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

function ModalFrame({
  title,
  description,
  onClose,
  children,
  className = "",
}: ModalFrameProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-modal-title"
        aria-describedby="trainer-modal-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "Tab") {
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
              ),
            );
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
        className={`my-auto w-full rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.2)] sm:p-7 ${className}`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2
              id="trainer-modal-title"
              className="text-[19px] font-semibold tracking-[-0.03em] text-[#263344]"
            >
              {title}
            </h2>
            <p id="trainer-modal-description" className="mt-1.5 text-[12px] text-[#84909d]">
              {description}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[#788391] hover:bg-[#f4f6f7]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

type GenerateCodeModalProps = {
  unclaimedTrainers: Trainer[];
  onClose: () => void;
  onGenerate: (payload: {
    trainerId?: string;
    presetName?: string;
    presetSpecialty?: string;
  }) => Promise<string | null>;
  isSaving: boolean;
  error: string;
};

function GenerateCodeModal({
  unclaimedTrainers,
  onClose,
  onGenerate,
  isSaving,
  error,
}: GenerateCodeModalProps) {
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [selectedTrainerId, setSelectedTrainerId] = useState(
    unclaimedTrainers[0]?.id ?? "",
  );
  const [presetName, setPresetName] = useState("");
  const [presetSpecialty, setPresetSpecialty] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = await onGenerate(
      targetMode === "existing" && selectedTrainerId
        ? { trainerId: selectedTrainerId }
        : {
            presetName: presetName.trim() || undefined,
            presetSpecialty: presetSpecialty.trim() || undefined,
          },
    );
    if (code) {
      setGeneratedCode(code);
    }
  }

  async function copyGenerated() {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  }

  return (
    <ModalFrame
      title="Generate trainer invite code"
      description="Share this one-time code with a coach so they can register as a trainer in the GymOS Mobile App."
      onClose={onClose}
      className="max-w-[480px]"
    >
      {generatedCode ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#cde7da] bg-[#f1faf5] p-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#278968]">
              Trainer Registration Code Ready
            </p>
            <p className="mt-2 font-mono text-[22px] font-bold tracking-[0.08em] text-[#1f2b39]">
              {generatedCode}
            </p>
            <p className="mt-2 text-[11px] text-[#687585]">
              Have the trainer open the Mobile App → Create Account → select{" "}
              <strong>Trainer</strong> and enter this code.
            </p>
            <button
              type="button"
              onClick={() => void copyGenerated()}
              className="mt-3.5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858]"
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? "Copied to clipboard!" : "Copy invite code"}
            </button>
          </div>
          <div className="flex justify-end border-t border-[#edf0f2] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {unclaimedTrainers.length > 0 && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f5f7] p-1">
              <button
                type="button"
                onClick={() => setTargetMode("new")}
                className={`min-h-9 rounded-lg text-[11px] font-semibold transition-colors ${
                  targetMode === "new"
                    ? "bg-white text-[#243242] shadow-sm"
                    : "text-[#6f7b89]"
                }`}
              >
                New coach hire
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("existing")}
                className={`min-h-9 rounded-lg text-[11px] font-semibold transition-colors ${
                  targetMode === "existing"
                    ? "bg-white text-[#243242] shadow-sm"
                    : "text-[#6f7b89]"
                }`}
              >
                Existing coach in list
              </button>
            </div>
          )}

          {targetMode === "existing" && unclaimedTrainers.length > 0 ? (
            <div>
              <label
                htmlFor="invite-existing-trainer"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Select directory trainer
              </label>
              <select
                id="invite-existing-trainer"
                value={selectedTrainerId}
                onChange={(event) => setSelectedTrainerId(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
              >
                {unclaimedTrainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.specialty}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-[#8993a0]">
                Links their Mobile App account directly to their existing clients and workouts.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="invite-preset-name"
                  className="mb-1.5 block text-[11px] font-medium text-[#526071]"
                >
                  Coach name <span className="font-normal text-[#9aa3ae]">(optional)</span>
                </label>
                <input
                  id="invite-preset-name"
                  maxLength={80}
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Leave blank or pre-fill coach name"
                  className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
                />
              </div>
              <div>
                <label
                  htmlFor="invite-preset-specialty"
                  className="mb-1.5 block text-[11px] font-medium text-[#526071]"
                >
                  Specialty <span className="font-normal text-[#9aa3ae]">(optional)</span>
                </label>
                <input
                  id="invite-preset-specialty"
                  maxLength={100}
                  value={presetSpecialty}
                  onChange={(event) => setPresetSpecialty(event.target.value)}
                  placeholder="e.g. Strength & Conditioning"
                  className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
                />
              </div>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
            >
              {isSaving ? "Generating…" : "Generate code"}
            </button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}

type ScheduleSessionModalProps = {
  trainers: Trainer[];
  members: Member[];
  onClose: () => void;
  onSchedule: (payload: {
    trainerId: string;
    memberId: string;
    title: string;
    startsAt: string;
    durationMinutes: number;
    notes: string;
  }) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function ScheduleSessionModal({
  trainers,
  members,
  onClose,
  onSchedule,
  isSaving,
  error,
}: ScheduleSessionModalProps) {
  const [trainerId, setTrainerId] = useState(trainers[0]?.id ?? "");
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [title, setTitle] = useState("1-on-1 Personal Training");
  const [startsAt, setStartsAt] = useState(defaultTomorrowLocalInput);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [notes, setNotes] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trainerId || !memberId || !title.trim() || !startsAt) return;
    void onSchedule({
      trainerId,
      memberId,
      title: title.trim(),
      startsAt: new Date(startsAt).toISOString(),
      durationMinutes,
      notes: notes.trim(),
    });
  }

  return (
    <ModalFrame
      title="Schedule coaching session"
      description="Book a training session so it appears on both the trainer's and member's Mobile App schedule."
      onClose={onClose}
      className="max-w-[520px]"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="session-trainer"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Trainer
            </label>
            <select
              id="session-trainer"
              required
              value={trainerId}
              onChange={(event) => setTrainerId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
            >
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="session-member"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Member
            </label>
            <select
              id="session-member"
              required
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="session-title"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Session focus / title
          </label>
          <input
            id="session-title"
            required
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Upper Body Strength & Form Check"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="session-starts-at"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Date &amp; start time
            </label>
            <input
              id="session-starts-at"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
            />
          </div>
          <div>
            <label
              htmlFor="session-duration"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Duration
            </label>
            <select
              id="session-duration"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="session-notes"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Notes <span className="font-normal text-[#9aa3ae]">(optional)</span>
          </label>
          <input
            id="session-notes"
            maxLength={240}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="e.g. Meet at squat rack · bring lifting straps"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !trainers.length || !members.length}
            className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Scheduling…" : "Schedule session"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

type AssignTrainerModalProps = {
  trainers: Trainer[];
  plans: WorkoutPlan[];
  members: Member[];
  onClose: () => void;
  onAssign: (memberId: string, trainerId: string, planId: string) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function AssignTrainerModal({
  trainers,
  plans,
  members,
  onClose,
  onAssign,
  isSaving,
  error,
}: AssignTrainerModalProps) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [trainerId, setTrainerId] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");

  useEffect(() => {
    if (!memberId && members.length) setMemberId(members[0].id);
    if (!planId && plans.length) setPlanId(plans[0].id);
  }, [memberId, members, planId, plans]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId || !planId) return;
    void onAssign(memberId, trainerId, planId);
  }

  return (
    <ModalFrame
      title="Assign workout or trainer"
      description="Assign a workout routine directly to a member (with or without a trainer). The member will confirm the routine in the Mobile App."
      onClose={onClose}
      className="max-w-[480px]"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="assignment-member"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Member
          </label>
          <select
            id="assignment-member"
            value={memberId}
            required
            onChange={(event) => setMemberId(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="assignment-trainer"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Trainer <span className="font-normal text-[#9aa3ae]">(optional)</span>
          </label>
          <select
            id="assignment-trainer"
            value={trainerId}
            onChange={(event) => setTrainerId(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          >
            <option value="">No trainer (Workout routine only)</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name} · {trainer.specialty}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="assignment-plan"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Workout plan
          </label>
          <select
            id="assignment-plan"
            value={planId}
            required
            onChange={(event) => setPlanId(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title}
              </option>
            ))}
          </select>
        </div>
        <p className="rounded-xl bg-[#f2faf5] px-3.5 py-2.5 text-[11px] leading-5 text-[#278968]">
          The member will see a verification message in the Mobile App to accept or decline this workout routine change.
        </p>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !members.length || !plans.length}
            className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Saving…" : trainerId ? "Assign trainer & routine" : "Send workout routine"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

type CreateTrainerModalProps = {
  onClose: () => void;
  onCreate: (trainer: { name: string; specialty: string; phone: string }) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function CreateTrainerModal({
  onClose,
  onCreate,
  isSaving,
  error,
}: CreateTrainerModalProps) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onCreate({
      name: name.trim(),
      specialty: specialty.trim(),
      phone: phone.trim(),
    });
  }

  return (
    <ModalFrame
      title="Add a trainer"
      description="Add a coach to your gym directory and automatically generate their Mobile App invite code."
      onClose={onClose}
      className="max-w-[480px]"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="trainer-name"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Trainer name
          </label>
          <input
            id="trainer-name"
            required
            maxLength={80}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Maya Hassan"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          />
        </div>
        <div>
          <label
            htmlFor="trainer-specialty"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Specialty
          </label>
          <input
            id="trainer-specialty"
            required
            maxLength={100}
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            placeholder="e.g. Strength & conditioning"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          />
        </div>
        <div>
          <label
            htmlFor="trainer-phone"
            className="mb-1.5 block text-[11px] font-medium text-[#526071]"
          >
            Phone
          </label>
          <input
            id="trainer-phone"
            type="tel"
            required
            maxLength={30}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. +20 100 123 4567"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]"
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save trainer"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

type CreatePlanModalProps = {
  onClose: () => void;
  onCreate: (
    plan: Omit<WorkoutPlan, "id" | "assignedMemberIds" | "assignedMemberNames">,
  ) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function CreatePlanModal({
  onClose,
  onCreate,
  isSaving,
  error,
}: CreatePlanModalProps) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([
    { id: 1, name: "", sets: "3", reps: "10", rest: "60 sec", muscle: "Chest" },
  ]);

  function updateExercise(
    id: number,
    field: keyof Omit<Exercise, "id">,
    value: string,
  ) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === id ? { ...exercise, [field]: value } : exercise,
      ),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const completeExercises = exercises
      .map((exercise) => ({ ...exercise, name: exercise.name.trim() }))
      .filter((exercise) => exercise.name);
    if (completeExercises.length === 0) return;
    void onCreate({
      title: title.trim(),
      goal: goal.trim(),
      exercises: completeExercises,
    });
  }

  return (
    <ModalFrame
      title="Create workout plan"
      description="Build a reusable workout template with exercise details."
      onClose={onClose}
      className="max-w-[760px]"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="workout-title"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Plan title
            </label>
            <input
              id="workout-title"
              required
              maxLength={80}
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. 3-Day Hypertrophy Split"
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994]"
            />
          </div>
          <div>
            <label
              htmlFor="workout-goal"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Target goal
            </label>
            <input
              id="workout-goal"
              required
              maxLength={80}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="e.g. Build strength"
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994]"
            />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[12px] font-semibold text-[#354153]">Exercises</h3>
              <p className="mt-1 text-[10px] text-[#8993a0]">
                Add sets, reps, rest, and target muscle group.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setExercises((current) => [
                  ...current,
                  {
                    id: Date.now(),
                    name: "",
                    sets: "3",
                    reps: "10",
                    rest: "60 sec",
                    muscle: "Chest",
                  },
                ])
              }
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#dce7e1] px-2.5 text-[10px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <Plus size={13} aria-hidden="true" />
              Add exercise
            </button>
          </div>
          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {exercises.map((exercise, index) => (
              <div
                key={exercise.id}
                className="rounded-xl border border-[#edf0f2] bg-[#fbfcfc] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8993a0]">
                    Exercise {index + 1}
                  </p>
                  {exercises.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove exercise ${index + 1}`}
                      onClick={() =>
                        setExercises((current) =>
                          current.filter((item) => item.id !== exercise.id),
                        )
                      }
                      className="grid size-7 place-items-center rounded-md text-[#8993a0] hover:bg-[#f1f3f5] hover:text-[#b64c44]"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <label htmlFor={`exercise-name-${exercise.id}`} className="sr-only">
                      Exercise name
                    </label>
                    <input
                      id={`exercise-name-${exercise.id}`}
                      required
                      maxLength={80}
                      value={exercise.name}
                      onChange={(event) =>
                        updateExercise(exercise.id, "name", event.target.value)
                      }
                      placeholder="Exercise name"
                      className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]"
                    />
                  </div>
                  <div>
                    <label htmlFor={`exercise-sets-${exercise.id}`} className="sr-only">
                      Sets
                    </label>
                    <input
                      id={`exercise-sets-${exercise.id}`}
                      required
                      maxLength={12}
                      value={exercise.sets}
                      onChange={(event) =>
                        updateExercise(exercise.id, "sets", event.target.value)
                      }
                      placeholder="Sets"
                      className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]"
                    />
                  </div>
                  <div>
                    <label htmlFor={`exercise-reps-${exercise.id}`} className="sr-only">
                      Reps
                    </label>
                    <input
                      id={`exercise-reps-${exercise.id}`}
                      required
                      maxLength={16}
                      value={exercise.reps}
                      onChange={(event) =>
                        updateExercise(exercise.id, "reps", event.target.value)
                      }
                      placeholder="Reps"
                      className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]"
                    />
                  </div>
                  <div>
                    <label htmlFor={`exercise-rest-${exercise.id}`} className="sr-only">
                      Rest time
                    </label>
                    <input
                      id={`exercise-rest-${exercise.id}`}
                      required
                      maxLength={16}
                      value={exercise.rest}
                      onChange={(event) =>
                        updateExercise(exercise.id, "rest", event.target.value)
                      }
                      placeholder="Rest"
                      className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`exercise-muscle-${exercise.id}`} className="sr-only">
                      Target muscle group
                    </label>
                    <select
                      id={`exercise-muscle-${exercise.id}`}
                      value={exercise.muscle}
                      onChange={(event) =>
                        updateExercise(exercise.id, "muscle", event.target.value)
                      }
                      className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]"
                    >
                      {muscleGroups.map((muscle) => (
                        <option key={muscle}>{muscle}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save workout plan"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function WorkoutPreview({
  plan,
  onClose,
}: {
  plan: WorkoutPlan;
  onClose: () => void;
}) {
  return (
    <ModalFrame
      title={plan.title}
      description={`Target goal: ${plan.goal}`}
      onClose={onClose}
      className="max-w-[600px]"
    >
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#f0f8f4] px-3.5 py-3 text-[11px] text-[#278968]">
        <Dumbbell size={15} aria-hidden="true" />
        {plan.exercises.length} exercises in this routine
      </div>
      <ol className="max-h-[55vh] space-y-2 overflow-y-auto">
        {plan.exercises.map((exercise, index) => (
          <li
            key={exercise.id}
            className="flex items-start gap-3 rounded-xl border border-[#edf0f2] p-3.5"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#f1f4f6] text-[10px] font-semibold text-[#697585]">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-[#354153]">{exercise.name}</p>
              <p className="mt-1.5 text-[10px] text-[#7b8794]">
                {exercise.sets} sets · {exercise.reps} reps · {exercise.rest} rest
              </p>
            </div>
            <span className="rounded-full bg-[#f3f5f6] px-2 py-1 text-[9px] font-medium text-[#6f7b89]">
              {exercise.muscle}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex justify-end border-t border-[#edf0f2] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858]"
        >
          Done
        </button>
      </div>
    </ModalFrame>
  );
}

export function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [invites, setInvites] = useState<TrainerInvite[]>([]);
  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<PendingWorkoutAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCreateTrainerModalOpen, setIsCreateTrainerModalOpen] = useState(false);
  const [isGenerateCodeModalOpen, setIsGenerateCodeModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setApiError("");
    try {
      const [trainerResponse, workoutResponse] = await Promise.all([
        fetch("/api/trainers", { cache: "no-store" }),
        fetch("/api/workouts", { cache: "no-store" }),
      ]);
      const trainerData = (await trainerResponse.json()) as {
        trainers?: Array<Omit<Trainer, "initials">>;
        members?: Member[];
        invites?: TrainerInvite[];
        sessions?: CoachingSession[];
        error?: string;
      };
      const workoutData = (await workoutResponse.json()) as {
        workoutPlans?: Array<{
          id: string;
          title: string;
          targetGoal: string;
          exercises: Array<{
            exerciseName: string;
            sets: string;
            reps: string;
            restTime: string;
            targetMuscleGroup: string;
          }>;
          assignedMemberIds: string[];
          assignedMemberNames: string[];
        }>;
        pendingAssignments?: PendingWorkoutAssignment[];
        error?: string;
      };
      if (!trainerResponse.ok) {
        throw new Error(trainerData.error ?? "Unable to load trainers.");
      }
      if (!workoutResponse.ok) {
        throw new Error(workoutData.error ?? "Unable to load workout plans.");
      }
      setTrainers(
        (trainerData.trainers ?? []).map((trainer) => ({
          ...trainer,
          initials: trainer.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
        })),
      );
      setMembers(trainerData.members ?? []);
      setInvites(trainerData.invites ?? []);
      setSessions(trainerData.sessions ?? []);
      setPlans(
        (workoutData.workoutPlans ?? []).map((plan) => ({
          id: plan.id,
          title: plan.title,
          goal: plan.targetGoal,
          exercises: plan.exercises.map((exercise, index) => ({
            id: index + 1,
            name: exercise.exerciseName,
            sets: exercise.sets,
            reps: exercise.reps,
            rest: exercise.restTime,
            muscle: exercise.targetMuscleGroup,
          })),
          assignedMemberIds: plan.assignedMemberIds,
          assignedMemberNames: plan.assignedMemberNames,
        })),
      );
      setPendingAssignments(workoutData.pendingAssignments ?? []);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Unable to load trainers and workout plans.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assignments: MemberAssignment[] = members.flatMap((member) => {
    const trainer = trainers.find((item) => item.assignedMemberIds.includes(member.id)) ?? null;
    const plan = plans.find((item) => item.assignedMemberIds.includes(member.id)) ?? null;
    const pendingItem = pendingAssignments.find((item) => item.memberId === member.id) ?? null;
    if (!trainer && !plan && !pendingItem) return [];
    return [
      {
        id: member.id,
        memberId: member.id,
        memberName: member.name,
        trainerId: trainer?.id ?? null,
        planId: plan?.id ?? null,
        pendingPlanId: pendingItem?.workoutPlanId ?? null,
      },
    ];
  });

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to save changes.");
    return data;
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard blocked
    }
  }

  async function createTrainer(trainer: {
    name: string;
    specialty: string;
    phone: string;
  }) {
    setIsSaving(true);
    setApiError("");
    try {
      await postJson("/api/trainers", { action: "create", ...trainer });
      setIsCreateTrainerModalOpen(false);
      await loadData();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to save trainer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function generateTrainerCode(payload: {
    trainerId?: string;
    presetName?: string;
    presetSpecialty?: string;
  }): Promise<string | null> {
    setIsSaving(true);
    setApiError("");
    try {
      const data = await postJson<{ invite: { code: string } }>("/api/trainers", {
        action: "generate-code",
        ...payload,
      });
      await loadData();
      return data.invite.code;
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to generate invite code.",
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function revokeCode(inviteId: string) {
    setApiError("");
    try {
      await postJson("/api/trainers", { action: "revoke-code", inviteId });
      await loadData();
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to revoke invite code.",
      );
    }
  }

  async function scheduleSession(payload: {
    trainerId: string;
    memberId: string;
    title: string;
    startsAt: string;
    durationMinutes: number;
    notes: string;
  }) {
    setIsSaving(true);
    setApiError("");
    try {
      await postJson("/api/trainers", { action: "schedule-session", ...payload });
      setIsScheduleModalOpen(false);
      await loadData();
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to schedule session.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSessionStatus(
    sessionId: string,
    status: "scheduled" | "completed" | "cancelled",
  ) {
    setApiError("");
    try {
      await postJson("/api/trainers", {
        action: "update-session-status",
        sessionId,
        status,
      });
      await loadData();
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to update session status.",
      );
    }
  }

  async function assignTrainer(memberId: string, trainerId: string, planId: string) {
    setIsSaving(true);
    setApiError("");
    try {
      if (trainerId) {
        await postJson("/api/trainers", { action: "assign", memberId, trainerId });
      } else {
        await postJson("/api/trainers", { action: "unassign", memberId });
      }
      await postJson("/api/workouts", {
        action: "assign",
        memberId,
        workoutPlanId: planId,
      });
      setIsAssignModalOpen(false);
      await loadData();
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to assign this member.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function createPlan(
    plan: Omit<WorkoutPlan, "id" | "assignedMemberIds" | "assignedMemberNames">,
  ) {
    setIsSaving(true);
    setApiError("");
    try {
      const data = await postJson<{ workoutPlan: { id: string } }>("/api/workouts", {
        action: "create",
        title: plan.title,
        targetGoal: plan.goal,
        exercises: plan.exercises.map((exercise) => ({
          exerciseName: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          restTime: exercise.rest,
          targetMuscleGroup: exercise.muscle,
        })),
      });
      setIsCreatePlanModalOpen(false);
      await loadData();
      setPreviewPlanId(data.workoutPlan.id);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to save workout plan.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const previewPlan = plans.find((plan) => plan.id === previewPlanId) ?? null;
  const unclaimedTrainers = trainers.filter((t) => !t.hasAppAccount);
  const visibleInvites = invites.filter((i) => i.status !== "revoked");

  const anyModalOpen =
    isAssignModalOpen ||
    isCreateTrainerModalOpen ||
    isGenerateCodeModalOpen ||
    isScheduleModalOpen ||
    isCreatePlanModalOpen;

  return (
    <AppShell activePage="Trainers">
      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9"
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
              Workspace
            </p>
            <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">
              Trainers &amp; Workouts
            </h1>
            <p className="mt-1.5 text-[13px] text-[#788391]">
              Generate trainer app codes, manage coaching schedules, and build member workout plans.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setApiError("");
                setIsGenerateCodeModalOpen(true);
              }}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[12px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <KeyRound size={15} aria-hidden="true" />
              Generate Trainer Code
            </button>
            <button
              type="button"
              onClick={() => {
                setApiError("");
                setIsScheduleModalOpen(true);
              }}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#e3e8ec] bg-white px-3.5 text-[12px] font-semibold text-[#354153] hover:bg-[#f7f9fa]"
            >
              <CalendarPlus size={15} aria-hidden="true" />
              Schedule Session
            </button>
            <button
              type="button"
              onClick={() => {
                setApiError("");
                setIsCreateTrainerModalOpen(true);
              }}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[12px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <Plus size={15} aria-hidden="true" />
              Add Trainer
            </button>
            <button
              type="button"
              onClick={() => {
                setApiError("");
                setIsAssignModalOpen(true);
              }}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-[#207858]"
            >
              <UserRoundPlus size={15} aria-hidden="true" />
              Assign Workout / Trainer
            </button>
          </div>
        </div>

        {apiError && !anyModalOpen && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-[#f1d2cd] bg-[#fff6f4] px-4 py-3 text-[12px] text-[#a9433b]"
          >
            {apiError}
          </p>
        )}

        <section aria-labelledby="trainers-heading" className="mb-8">
          <div className="mb-4">
            <h2
              id="trainers-heading"
              className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]"
            >
              Trainers directory
            </h2>
            <p className="mt-1 text-[11px] text-[#87909d]">
              Active coaching team, Mobile App registration status, shifts, and assigned clients
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {trainers.map((trainer, index) => {
              const clientCount = trainer.assignedMemberIds.length;
              return (
                <Card key={trainer.id} className="flex flex-col justify-between p-5">
                  <div>
                    <div className="flex items-start gap-3.5">
                      <span
                        className={`grid size-12 shrink-0 place-items-center rounded-2xl text-[12px] font-semibold ${
                          trainerColors[index % trainerColors.length]
                        }`}
                        aria-hidden="true"
                      >
                        {trainer.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-[#354153]">
                            {trainer.name}
                          </p>
                          {trainer.hasAppAccount ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eaf6f0] px-2 py-0.5 text-[9px] font-semibold text-[#278968]">
                              <Smartphone size={10} aria-hidden="true" />
                              App active
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff4e8] px-2 py-0.5 text-[9px] font-semibold text-[#bd7838]">
                              Pending app
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[11px] text-[#87909d]">
                          {trainer.specialty}
                        </p>
                        <p className="mt-1 truncate text-[10px] text-[#9aa3ae]">
                          {trainer.phone}
                          {trainer.email ? ` · ${trainer.email}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#f7f9fa] px-3 py-2 text-[10px] text-[#687585]">
                      <Clock3 size={12} className="shrink-0 text-[#8993a0]" aria-hidden="true" />
                      <span className="truncate">
                        {summarizeAvailability(trainer.availability)}
                      </span>
                      {(trainer.upcomingSessionsCount ?? 0) > 0 && (
                        <span className="ml-auto shrink-0 font-semibold text-[#278968]">
                          {trainer.upcomingSessionsCount} upcoming
                        </span>
                      )}
                    </div>

                    {!trainer.hasAppAccount && (
                      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[#e3ece7] bg-[#f5fbf7] px-3 py-2">
                        {trainer.inviteCode ? (
                          <>
                            <div className="min-w-0">
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-[#6b8f7f]">
                                App Invite Code
                              </p>
                              <p className="font-mono text-[11px] font-bold text-[#1f2b39]">
                                {trainer.inviteCode}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyCode(trainer.inviteCode!)}
                              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-[#cfe5d9] bg-white px-2.5 text-[10px] font-semibold text-[#278968] hover:bg-[#eaf6f0]"
                            >
                              {copiedCode === trainer.inviteCode ? (
                                <Check size={12} aria-hidden="true" />
                              ) : (
                                <Copy size={12} aria-hidden="true" />
                              )}
                              {copiedCode === trainer.inviteCode ? "Copied" : "Copy"}
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-[#687585]">
                              No active invite code
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void generateTrainerCode({ trainerId: trainer.id })
                              }
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#cfe5d9] bg-white px-2.5 text-[10px] font-semibold text-[#278968] hover:bg-[#eaf6f0]"
                            >
                              <RefreshCw size={11} aria-hidden="true" />
                              Generate code
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[#edf0f2] pt-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#778291]">
                      <UsersRound size={14} aria-hidden="true" />
                      {trainer.assignedMemberNames.length > 0
                        ? trainer.assignedMemberNames.slice(0, 2).join(", ") +
                          (trainer.assignedMemberNames.length > 2
                            ? ` +${trainer.assignedMemberNames.length - 2}`
                            : "")
                        : "Assigned clients"}
                    </span>
                    <span className="text-[12px] font-semibold text-[#354153]">
                      {clientCount} {clientCount === 1 ? "client" : "clients"}
                    </span>
                  </div>
                </Card>
              );
            })}
            {!isLoading && trainers.length === 0 && (
              <p className="text-[12px] text-[#8993a0]">No trainers in this gym yet.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="trainer-codes-heading" className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="trainer-codes-heading"
                className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]"
              >
                Trainer app invite codes
              </h2>
              <p className="mt-1 text-[11px] text-[#87909d]">
                One-time codes required for coaches to register as trainers in the Mobile App
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsGenerateCodeModalOpen(true)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <KeyRound size={14} aria-hidden="true" />
              New Invite Code
            </button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Invite code", "Designated coach", "Specialty", "Status", "Actions"].map(
                      (heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {visibleInvites.map((invite) => (
                    <tr key={invite.id} className="transition-colors hover:bg-[#fbfcfc]">
                      <th
                        scope="row"
                        className="px-5 py-3.5 font-mono text-[12px] font-bold text-[#243242]"
                      >
                        {invite.code}
                      </th>
                      <td className="px-5 py-3.5 text-[11px] text-[#596575]">
                        {invite.claimedByName || invite.presetName || "Any new trainer"}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-[#596575]">
                        {invite.presetSpecialty || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        {invite.status === "unused" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf6f0] px-2.5 py-1 text-[10px] font-semibold text-[#278968]">
                            Ready to use
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[10px] font-medium text-[#6f7b89]">
                            <CheckCircle2 size={12} aria-hidden="true" />
                            Claimed{invite.claimedByName ? ` · ${invite.claimedByName}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {invite.status === "unused" ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void copyCode(invite.code)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[10px] font-semibold text-[#354153] hover:bg-[#f7f9fa]"
                            >
                              {copiedCode === invite.code ? (
                                <Check size={12} aria-hidden="true" />
                              ) : (
                                <Copy size={12} aria-hidden="true" />
                              )}
                              {copiedCode === invite.code ? "Copied" : "Copy"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void revokeCode(invite.id)}
                              aria-label={`Revoke code ${invite.code}`}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#f2d5d1] bg-white px-2.5 text-[10px] font-medium text-[#b64c44] hover:bg-[#fff5f3]"
                            >
                              <Trash2 size={12} aria-hidden="true" />
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#9aa3ae]">Activated in app</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleInvites.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-8 text-center text-[12px] text-[#8993a0]"
                      >
                        No trainer invite codes yet. Click &ldquo;Generate Trainer Code&rdquo; to
                        onboard a coach.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <section aria-labelledby="schedule-heading" className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="schedule-heading"
                className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]"
              >
                Coaching schedule &amp; sessions
              </h2>
              <p className="mt-1 text-[11px] text-[#87909d]">
                Synced live with trainers and members inside the GymOS Mobile App
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <CalendarPlus size={14} aria-hidden="true" />
              Schedule Session
            </button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {[
                      "Date & time",
                      "Trainer",
                      "Member",
                      "Session focus",
                      "Status",
                      "Update",
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {sessions.map((session) => (
                    <tr key={session.id} className="transition-colors hover:bg-[#fbfcfc]">
                      <td className="px-5 py-3.5 text-[11px] font-semibold text-[#354153]">
                        {formatSessionDateTime(session.startsAt)}
                        <span className="ml-1.5 font-normal text-[#8993a0]">
                          ({session.durationMinutes}m)
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-[#596575]">
                        {session.trainerName}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] font-medium text-[#354153]">
                        {session.memberName}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-[#596575]">
                        <span>{session.title}</span>
                        {session.notes && (
                          <span className="mt-0.5 block text-[10px] text-[#9aa3ae]">
                            {session.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${
                            session.status === "scheduled"
                              ? "bg-[#e9f2ff] text-[#3f68b2]"
                              : session.status === "completed"
                                ? "bg-[#eaf6f0] text-[#278968]"
                                : "bg-[#fff0ee] text-[#c4544c]"
                          }`}
                        >
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {session.status === "scheduled" ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                void updateSessionStatus(session.id, "completed")
                              }
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#cfe5d9] bg-white px-2.5 text-[10px] font-semibold text-[#278968] hover:bg-[#f0f9f4]"
                            >
                              Complete
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void updateSessionStatus(session.id, "cancelled")
                              }
                              className="inline-flex min-h-8 items-center rounded-lg border border-[#e3e8ec] bg-white px-2 text-[10px] font-medium text-[#788391] hover:bg-[#f7f9fa]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#9aa3ae]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-[12px] text-[#8993a0]"
                      >
                        No coaching sessions scheduled yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <section aria-labelledby="workout-plans-heading" className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="workout-plans-heading"
                className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]"
              >
                Workout plan templates
              </h2>
              <p className="mt-1 text-[11px] text-[#87909d]">
                Reusable routines for common training goals
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreatePlanModalOpen(true)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <Plus size={15} aria-hidden="true" />
              Create Workout Plan
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#eaf6f0] text-[#278968]">
                    <Dumbbell size={17} aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[9px] font-medium text-[#6f7b89]">
                    {plan.goal}
                  </span>
                </div>
                <h3 className="text-[13px] font-semibold text-[#354153]">{plan.title}</h3>
                <p className="mt-1.5 text-[10px] text-[#87909d]">
                  {plan.exercises.length} exercises · Workout template
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewPlanId(plan.id)}
                  className="mt-4 inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-[#278968] hover:text-[#207858]"
                >
                  Preview routine
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              </Card>
            ))}
            {!isLoading && plans.length === 0 && (
              <p className="text-[12px] text-[#8993a0]">
                No workout plans yet. Create the first template.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="assignments-heading">
          <div className="mb-4">
            <h2
              id="assignments-heading"
              className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]"
            >
              Assigned member workouts
            </h2>
            <p className="mt-1 text-[11px] text-[#87909d]">
              Members with their current trainer and workout routine
            </p>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <caption className="sr-only">
                  Members, their trainers, and assigned workout plans
                </caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Member", "Assigned trainer", "Workout plan", "Goal", "Preview"].map(
                      (heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {assignments.map((assignment) => {
                    const trainer = assignment.trainerId
                      ? trainers.find((item) => item.id === assignment.trainerId)
                      : null;
                    const plan = assignment.planId
                      ? plans.find((item) => item.id === assignment.planId)
                      : null;
                    const pendingPlan = assignment.pendingPlanId
                      ? plans.find((item) => item.id === assignment.pendingPlanId)
                      : null;
                    const previewTarget = pendingPlan ?? plan;
                    return (
                      <tr
                        key={assignment.id}
                        className="transition-colors hover:bg-[#fbfcfc]"
                      >
                        <th
                          scope="row"
                          className="px-5 py-4 text-[12px] font-semibold text-[#354153]"
                        >
                          {assignment.memberName}
                        </th>
                        <td className="px-5 py-4 text-[11px] text-[#596575]">
                          {trainer ? (
                            trainer.name
                          ) : (
                            <span className="text-[#8993a0]">No trainer assigned</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-[11px] text-[#596575]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{plan ? plan.title : pendingPlan ? pendingPlan.title : "Pending coach selection"}</span>
                            {pendingPlan && (
                              <span className="rounded-full bg-[#fff4e8] px-2 py-0.5 text-[9px] font-semibold text-[#bd7838]">
                                Pending member verification{plan ? ` (${pendingPlan.title})` : ""}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[9px] font-medium text-[#6f7b89]">
                            {plan ? plan.goal : pendingPlan ? pendingPlan.goal : "Coach assigned"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {previewTarget ? (
                            <button
                              type="button"
                              onClick={() => setPreviewPlanId(previewTarget.id)}
                              aria-label={`Preview ${previewTarget.title} for ${assignment.memberName}`}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e3e8ec] px-2.5 text-[10px] font-medium text-[#687585] hover:bg-[#f7f9fa]"
                            >
                              Preview
                              <ChevronRight size={12} aria-hidden="true" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-[#9aa3ae]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {assignments.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-12 text-center text-[12px] text-[#8993a0]"
                      >
                        No member workouts assigned yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              <span>{assignments.length} member assignments</span>
              <span>
                {isLoading
                  ? "Loading assignments…"
                  : "Trainer and plan assignments from MongoDB"}
              </span>
            </div>
          </Card>
        </section>
        <footer className="px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">
          GymOS · Trainers &amp; Workouts
        </footer>
      </main>
      {isAssignModalOpen && (
        <AssignTrainerModal
          trainers={trainers}
          plans={plans}
          members={members}
          onClose={() => setIsAssignModalOpen(false)}
          onAssign={assignTrainer}
          isSaving={isSaving}
          error={apiError}
        />
      )}
      {isCreateTrainerModalOpen && (
        <CreateTrainerModal
          onClose={() => setIsCreateTrainerModalOpen(false)}
          onCreate={createTrainer}
          isSaving={isSaving}
          error={apiError}
        />
      )}
      {isGenerateCodeModalOpen && (
        <GenerateCodeModal
          unclaimedTrainers={unclaimedTrainers}
          onClose={() => setIsGenerateCodeModalOpen(false)}
          onGenerate={generateTrainerCode}
          isSaving={isSaving}
          error={apiError}
        />
      )}
      {isScheduleModalOpen && (
        <ScheduleSessionModal
          trainers={trainers}
          members={members}
          onClose={() => setIsScheduleModalOpen(false)}
          onSchedule={scheduleSession}
          isSaving={isSaving}
          error={apiError}
        />
      )}
      {isCreatePlanModalOpen && (
        <CreatePlanModal
          onClose={() => setIsCreatePlanModalOpen(false)}
          onCreate={createPlan}
          isSaving={isSaving}
          error={apiError}
        />
      )}
      {previewPlan && (
        <WorkoutPreview plan={previewPlan} onClose={() => setPreviewPlanId(null)} />
      )}
    </AppShell>
  );
}
