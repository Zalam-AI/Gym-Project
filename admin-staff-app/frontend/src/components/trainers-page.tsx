"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronRight,
  Dumbbell,
  Plus,
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

type Trainer = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  phone: string;
  assignedMemberIds: string[];
  assignedMemberNames: string[];
};

type MemberAssignment = {
  id: string;
  memberId: string;
  memberName: string;
  trainerId: string;
  planId: string;
};

type Member = { id: string; name: string };

const muscleGroups = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full body", "Cardio"];
const trainerColors = ["bg-[#e9f2ff] text-[#4d73b8]", "bg-[#f3eefe] text-[#8c62b4]", "bg-[#fff0e8] text-[#c77c4a]"];

type ModalFrameProps = {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

function ModalFrame({ title, description, onClose, children, className = "" }: ModalFrameProps) {
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
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
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
            <h2 id="trainer-modal-title" className="text-[19px] font-semibold tracking-[-0.03em] text-[#263344]">{title}</h2>
            <p id="trainer-modal-description" className="mt-1.5 text-[12px] text-[#84909d]">{description}</p>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-[#788391] hover:bg-[#f4f6f7]">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
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

function AssignTrainerModal({ trainers, plans, members, onClose, onAssign, isSaving, error }: AssignTrainerModalProps) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [trainerId, setTrainerId] = useState(trainers[0]?.id ?? "");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");

  useEffect(() => {
    if (!memberId && members.length) setMemberId(members[0].id);
    if (!trainerId && trainers.length) setTrainerId(trainers[0].id);
    if (!planId && plans.length) setPlanId(plans[0].id);
  }, [memberId, members, planId, plans, trainerId, trainers]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId || !trainerId || !planId) return;
    void onAssign(memberId, trainerId, planId);
  }

  return (
    <ModalFrame title="Assign a trainer" description="Connect a member with a trainer and workout plan." onClose={onClose} className="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="assignment-member" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Member</label>
          <select id="assignment-member" value={memberId} required onChange={(event) => setMemberId(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]">
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="assignment-trainer" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Trainer</label>
          <select id="assignment-trainer" value={trainerId} required onChange={(event) => setTrainerId(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]">
            {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name} · {trainer.specialty}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="assignment-plan" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Workout plan</label>
          <select id="assignment-plan" value={planId} required onChange={(event) => setPlanId(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]">
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={isSaving || !members.length || !trainers.length || !plans.length} className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving…" : "Assign trainer"}</button>
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

function CreateTrainerModal({ onClose, onCreate, isSaving, error }: CreateTrainerModalProps) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onCreate({ name: name.trim(), specialty: specialty.trim(), phone: phone.trim() });
  }

  return (
    <ModalFrame title="Add a trainer" description="Add a coach to your gym directory." onClose={onClose} className="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="trainer-name" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Trainer name</label>
          <input id="trainer-name" required maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya Hassan" className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]" />
        </div>
        <div>
          <label htmlFor="trainer-specialty" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Specialty</label>
          <input id="trainer-specialty" required maxLength={100} value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="e.g. Strength & conditioning" className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]" />
        </div>
        <div>
          <label htmlFor="trainer-phone" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Phone</label>
          <input id="trainer-phone" type="tel" required maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. +20 100 123 4567" className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994]" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving…" : "Save trainer"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

type CreatePlanModalProps = {
  onClose: () => void;
  onCreate: (plan: Omit<WorkoutPlan, "id" | "assignedMemberIds" | "assignedMemberNames">) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function CreatePlanModal({ onClose, onCreate, isSaving, error }: CreatePlanModalProps) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([
    { id: 1, name: "", sets: "3", reps: "10", rest: "60 sec", muscle: "Chest" },
  ]);

  function updateExercise(id: number, field: keyof Omit<Exercise, "id">, value: string) {
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, [field]: value } : exercise));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const completeExercises = exercises
      .map((exercise) => ({ ...exercise, name: exercise.name.trim() }))
      .filter((exercise) => exercise.name);
    if (completeExercises.length === 0) return;
    void onCreate({ title: title.trim(), goal: goal.trim(), exercises: completeExercises });
  }

  return (
    <ModalFrame title="Create workout plan" description="Build a reusable workout template with exercise details." onClose={onClose} className="max-w-[760px]">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="workout-title" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Plan title</label>
            <input id="workout-title" required maxLength={80} autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. 3-Day Hypertrophy Split" className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994]" />
          </div>
          <div>
            <label htmlFor="workout-goal" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Target goal</label>
            <input id="workout-goal" required maxLength={80} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. Build strength" className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994]" />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[12px] font-semibold text-[#354153]">Exercises</h3>
              <p className="mt-1 text-[10px] text-[#8993a0]">Add sets, reps, rest, and target muscle group.</p>
            </div>
            <button type="button" onClick={() => setExercises((current) => [...current, { id: Date.now(), name: "", sets: "3", reps: "10", rest: "60 sec", muscle: "Chest" }])} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#dce7e1] px-2.5 text-[10px] font-semibold text-[#278968] hover:bg-[#f1f8f4]">
              <Plus size={13} aria-hidden="true" />
              Add exercise
            </button>
          </div>
          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {exercises.map((exercise, index) => (
              <div key={exercise.id} className="rounded-xl border border-[#edf0f2] bg-[#fbfcfc] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8993a0]">Exercise {index + 1}</p>
                  {exercises.length > 1 && (
                    <button type="button" aria-label={`Remove exercise ${index + 1}`} onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))} className="grid size-7 place-items-center rounded-md text-[#8993a0] hover:bg-[#f1f3f5] hover:text-[#b64c44]">
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <label htmlFor={`exercise-name-${exercise.id}`} className="sr-only">Exercise name</label>
                    <input id={`exercise-name-${exercise.id}`} required maxLength={80} value={exercise.name} onChange={(event) => updateExercise(exercise.id, "name", event.target.value)} placeholder="Exercise name" className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]" />
                  </div>
                  <div>
                    <label htmlFor={`exercise-sets-${exercise.id}`} className="sr-only">Sets</label>
                    <input id={`exercise-sets-${exercise.id}`} required maxLength={12} value={exercise.sets} onChange={(event) => updateExercise(exercise.id, "sets", event.target.value)} placeholder="Sets" className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]" />
                  </div>
                  <div>
                    <label htmlFor={`exercise-reps-${exercise.id}`} className="sr-only">Reps</label>
                    <input id={`exercise-reps-${exercise.id}`} required maxLength={16} value={exercise.reps} onChange={(event) => updateExercise(exercise.id, "reps", event.target.value)} placeholder="Reps" className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]" />
                  </div>
                  <div>
                    <label htmlFor={`exercise-rest-${exercise.id}`} className="sr-only">Rest time</label>
                    <input id={`exercise-rest-${exercise.id}`} required maxLength={16} value={exercise.rest} onChange={(event) => updateExercise(exercise.id, "rest", event.target.value)} placeholder="Rest" className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`exercise-muscle-${exercise.id}`} className="sr-only">Target muscle group</label>
                    <select id={`exercise-muscle-${exercise.id}`} value={exercise.muscle} onChange={(event) => updateExercise(exercise.id, "muscle", event.target.value)} className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]">
                      {muscleGroups.map((muscle) => <option key={muscle}>{muscle}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving…" : "Save workout plan"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

function WorkoutPreview({ plan, onClose }: { plan: WorkoutPlan; onClose: () => void }) {
  return (
    <ModalFrame title={plan.title} description={`Target goal: ${plan.goal}`} onClose={onClose} className="max-w-[600px]">
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#f0f8f4] px-3.5 py-3 text-[11px] text-[#278968]">
        <Dumbbell size={15} aria-hidden="true" />
        {plan.exercises.length} exercises in this routine
      </div>
      <ol className="max-h-[55vh] space-y-2 overflow-y-auto">
        {plan.exercises.map((exercise, index) => (
          <li key={exercise.id} className="flex items-start gap-3 rounded-xl border border-[#edf0f2] p-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#f1f4f6] text-[10px] font-semibold text-[#697585]">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-[#354153]">{exercise.name}</p>
              <p className="mt-1.5 text-[10px] text-[#7b8794]">{exercise.sets} sets · {exercise.reps} reps · {exercise.rest} rest</p>
            </div>
            <span className="rounded-full bg-[#f3f5f6] px-2 py-1 text-[9px] font-medium text-[#6f7b89]">{exercise.muscle}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex justify-end border-t border-[#edf0f2] pt-4">
        <button type="button" onClick={onClose} className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858]">Done</button>
      </div>
    </ModalFrame>
  );
}

export function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCreateTrainerModalOpen, setIsCreateTrainerModalOpen] = useState(false);
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
      const trainerData = await trainerResponse.json() as { trainers?: Array<Omit<Trainer, "initials">>; members?: Member[]; error?: string };
      const workoutData = await workoutResponse.json() as { workoutPlans?: Array<{ id: string; title: string; targetGoal: string; exercises: Array<{ exerciseName: string; sets: string; reps: string; restTime: string; targetMuscleGroup: string }>; assignedMemberIds: string[]; assignedMemberNames: string[] }>; error?: string };
      if (!trainerResponse.ok) throw new Error(trainerData.error ?? "Unable to load trainers.");
      if (!workoutResponse.ok) throw new Error(workoutData.error ?? "Unable to load workout plans.");
      setTrainers((trainerData.trainers ?? []).map((trainer) => ({
        ...trainer,
        initials: trainer.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      })));
      setMembers(trainerData.members ?? []);
      setPlans((workoutData.workoutPlans ?? []).map((plan) => ({
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
      })));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to load trainers and workout plans.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assignments: MemberAssignment[] = members.flatMap((member) => {
    const trainer = trainers.find((item) => item.assignedMemberIds.includes(member.id));
    const plan = plans.find((item) => item.assignedMemberIds.includes(member.id));
    return trainer && plan ? [{ id: member.id, memberId: member.id, memberName: member.name, trainerId: trainer.id, planId: plan.id }] : [];
  });

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to save changes.");
    return data;
  }

  async function createTrainer(trainer: { name: string; specialty: string; phone: string }) {
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

  async function assignTrainer(memberId: string, trainerId: string, planId: string) {
    setIsSaving(true);
    setApiError("");
    try {
      await postJson("/api/trainers", { action: "assign", memberId, trainerId });
      await postJson("/api/workouts", { action: "assign", memberId, workoutPlanId: planId });
      setIsAssignModalOpen(false);
      await loadData();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to assign this member.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createPlan(plan: Omit<WorkoutPlan, "id" | "assignedMemberIds" | "assignedMemberNames">) {
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
      setApiError(error instanceof Error ? error.message : "Unable to save workout plan.");
    } finally {
      setIsSaving(false);
    }
  }

  const previewPlan = plans.find((plan) => plan.id === previewPlanId) ?? null;

  return (
    <AppShell activePage="Trainers">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Workspace</p>
            <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">Trainers &amp; Workouts</h1>
            <p className="mt-1.5 text-[13px] text-[#788391]">Build training plans and keep every member on track.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setIsCreateTrainerModalOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce7e1] bg-white px-4 text-[12px] font-semibold text-[#278968] hover:bg-[#f1f8f4]">
              <Plus size={15} aria-hidden="true" />
              Add Trainer
            </button>
            <button type="button" onClick={() => setIsAssignModalOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-[#207858]">
              <UserRoundPlus size={15} aria-hidden="true" />
              Assign Trainer
            </button>
          </div>
        </div>

        {apiError && !isAssignModalOpen && !isCreateTrainerModalOpen && !isCreatePlanModalOpen && (
          <p role="alert" className="mb-5 rounded-lg border border-[#f1d2cd] bg-[#fff6f4] px-4 py-3 text-[12px] text-[#a9433b]">{apiError}</p>
        )}

        <section aria-labelledby="trainers-heading" className="mb-8">
          <div className="mb-4">
            <h2 id="trainers-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Trainers directory</h2>
            <p className="mt-1 text-[11px] text-[#87909d]">Your active coaching team and client assignments</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {trainers.map((trainer, index) => {
              const clientCount = assignments.filter((assignment) => assignment.trainerId === trainer.id).length;
              return (
                <Card key={trainer.id} className="p-5">
                  <div className="flex items-center gap-3.5">
                    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-[12px] font-semibold ${trainerColors[index % trainerColors.length]}`} aria-hidden="true">{trainer.initials}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#354153]">{trainer.name}</p>
                      <p className="mt-1 truncate text-[11px] text-[#87909d]">{trainer.specialty}</p>
                      <p className="mt-1 truncate text-[10px] text-[#9aa3ae]">{trainer.phone}</p>
                    </div>
                    <span className="size-2 rounded-full bg-[#3db287]" title="Active trainer" />
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-[#edf0f2] pt-4">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#778291]">
                      <UsersRound size={14} aria-hidden="true" />
                      Assigned clients
                    </span>
                    <span className="text-[12px] font-semibold text-[#354153]">{clientCount}</span>
                  </div>
                </Card>
              );
            })}
            {!isLoading && trainers.length === 0 && <p className="text-[12px] text-[#8993a0]">No trainers in this gym yet.</p>}
          </div>
        </section>

        <section aria-labelledby="workout-plans-heading" className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="workout-plans-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Workout plan templates</h2>
              <p className="mt-1 text-[11px] text-[#87909d]">Reusable routines for common training goals</p>
            </div>
            <button type="button" onClick={() => setIsCreatePlanModalOpen(true)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]">
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
                  <span className="rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[9px] font-medium text-[#6f7b89]">{plan.goal}</span>
                </div>
                <h3 className="text-[13px] font-semibold text-[#354153]">{plan.title}</h3>
                <p className="mt-1.5 text-[10px] text-[#87909d]">{plan.exercises.length} exercises · Workout template</p>
                <button type="button" onClick={() => setPreviewPlanId(plan.id)} className="mt-4 inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-[#278968] hover:text-[#207858]">
                  Preview routine
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              </Card>
            ))}
            {!isLoading && plans.length === 0 && <p className="text-[12px] text-[#8993a0]">No workout plans yet. Create the first template.</p>}
          </div>
        </section>

        <section aria-labelledby="assignments-heading">
          <div className="mb-4">
            <h2 id="assignments-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Assigned member workouts</h2>
            <p className="mt-1 text-[11px] text-[#87909d]">Members with their current trainer and workout routine</p>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <caption className="sr-only">Members, their trainers, and assigned workout plans</caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Member", "Assigned trainer", "Workout plan", "Goal", "Preview"].map((heading) => (
                      <th key={heading} scope="col" className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {assignments.map((assignment) => {
                    const trainer = trainers.find((item) => item.id === assignment.trainerId);
                    const plan = plans.find((item) => item.id === assignment.planId);
                    if (!trainer || !plan) return null;
                    return (
                      <tr key={assignment.id} className="transition-colors hover:bg-[#fbfcfc]">
                        <th scope="row" className="px-5 py-4 text-[12px] font-semibold text-[#354153]">{assignment.memberName}</th>
                        <td className="px-5 py-4 text-[11px] text-[#596575]">{trainer.name}</td>
                        <td className="px-5 py-4 text-[11px] text-[#596575]">{plan.title}</td>
                        <td className="px-5 py-4"><span className="rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[9px] font-medium text-[#6f7b89]">{plan.goal}</span></td>
                        <td className="px-5 py-4">
                          <button type="button" onClick={() => setPreviewPlanId(plan.id)} aria-label={`Preview ${plan.title} for ${assignment.memberName}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e3e8ec] px-2.5 text-[10px] font-medium text-[#687585] hover:bg-[#f7f9fa]">
                            Preview
                            <ChevronRight size={12} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {assignments.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-[12px] text-[#8993a0]">No member workouts assigned yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              <span>{assignments.length} member assignments</span>
              <span>{isLoading ? "Loading assignments…" : "Trainer and plan assignments from MongoDB"}</span>
            </div>
          </Card>
        </section>
        <footer className="px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">GymOS · Trainers &amp; Workouts</footer>
      </main>
      {isAssignModalOpen && (
        <AssignTrainerModal trainers={trainers} plans={plans} members={members} onClose={() => setIsAssignModalOpen(false)} onAssign={assignTrainer} isSaving={isSaving} error={apiError} />
      )}
      {isCreateTrainerModalOpen && (
        <CreateTrainerModal onClose={() => setIsCreateTrainerModalOpen(false)} onCreate={createTrainer} isSaving={isSaving} error={apiError} />
      )}
      {isCreatePlanModalOpen && (
        <CreatePlanModal onClose={() => setIsCreatePlanModalOpen(false)} onCreate={createPlan} isSaving={isSaving} error={apiError} />
      )}
      {previewPlan && <WorkoutPreview plan={previewPlan} onClose={() => setPreviewPlanId(null)} />}
    </AppShell>
  );
}
