"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { ui } from "@/lib/theme";

export type TutorialTabTarget = "Pass" | "Workout" | "Progress" | "Visits" | "Profile";

type TutorialStep = {
  id: string;
  tab: TutorialTabTarget;
  targetTourId: string;
  badge: string;
  title: string;
  description: string;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "home",
    tab: "Pass",
    targetTourId: "tour-home-hero",
    badge: "Step 1 of 5",
    title: "Home & Today's Workout",
    description:
      "See today's scheduled training, resume an active session, or launch a Free Workout in one tap.",
  },
  {
    id: "checkin",
    tab: "Pass",
    targetTourId: "tour-digital-pass",
    badge: "Step 2 of 5",
    title: "Digital Pass & QR Check-In",
    description:
      "Check your active plan and scan the gym reception QR code whenever you arrive to log your visit.",
  },
  {
    id: "workouts",
    tab: "Workout",
    targetTourId: "workout-hub-actions",
    badge: "Step 3 of 5",
    title: "Routines & Exercise Library",
    description:
      "Create personal weekly routines, explore exercise form demos, and track sets in full-screen workout mode.",
  },
  {
    id: "progress",
    tab: "Progress",
    targetTourId: "tour-progress-overview",
    badge: "Step 4 of 5",
    title: "Progress & Workout History",
    description:
      "Every completed set, actual weight, personal record, and training streak is saved here automatically.",
  },
  {
    id: "profile",
    tab: "Profile",
    targetTourId: "tour-profile-settings",
    badge: "Step 5 of 5",
    title: "Profile, Language & Settings",
    description:
      "Switch between English and العربية anytime in the top bar, customize rest timers, or replay this guide.",
  },
];

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function MemberTutorialOverlay({
  open,
  onSelectTab,
  onComplete,
  onSkip,
}: {
  open: boolean;
  onSelectTab: (tab: TutorialTabTarget) => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [viewportH, setViewportH] = useState(800);

  const currentStep = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0];
  const isLastStep = stepIndex >= TUTORIAL_STEPS.length - 1;

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    onSelectTab(currentStep.tab);

    let rafId = 0;
    let timerId: number | null = null;

    const measure = (scrollIntoViewFirst: boolean) => {
      if (typeof window === "undefined") return;
      setViewportH(window.innerHeight || 800);
      const target = document.querySelector<HTMLElement>(
        `[data-tour-id="${currentStep.targetTourId}"]`,
      );
      if (!target) {
        setRect(null);
        return;
      }
      if (scrollIntoViewFirst) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const r = target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setRect({
          top: Math.max(8, r.top - 6),
          left: Math.max(8, r.left - 6),
          width: Math.min(window.innerWidth - 16, r.width + 12),
          height: r.height + 12,
        });
      } else {
        setRect(null);
      }
    };

    timerId = window.setTimeout(() => {
      measure(true);
      window.setTimeout(() => measure(false), 260);
    }, 90);

    const handleRelayout = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => measure(false));
    };

    window.addEventListener("resize", handleRelayout);
    window.addEventListener("scroll", handleRelayout, true);
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleRelayout);
      window.removeEventListener("scroll", handleRelayout, true);
    };
  }, [open, stepIndex, currentStep.tab, currentStep.targetTourId, onSelectTab]);

  if (!open) return null;

  const placeTooltipBelow = !rect || rect.top + rect.height / 2 < viewportH * 0.48;
  const tooltipStyle = rect
    ? placeTooltipBelow
      ? { top: Math.min(viewportH - 220, rect.top + rect.height + 12) }
      : { bottom: Math.max(16, viewportH - rect.top + 12) }
    : { bottom: 92 };

  const advance = () => {
    if (isLastStep) {
      onSelectTab("Pass");
      onComplete();
    } else {
      setStepIndex((idx) => Math.min(TUTORIAL_STEPS.length - 1, idx + 1));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Member app quick guide"
      className="fixed inset-0 z-50"
    >
      {/* Subtle scrim */}
      <div
        onClick={advance}
        aria-hidden="true"
        className="absolute inset-0 bg-scrim transition-opacity"
      />

      {/* Interactive spotlight ring over the real feature */}
      {rect && (
        <button
          type="button"
          onClick={advance}
          aria-label={`${currentStep.title} — tap to continue`}
          style={{
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          className="fixed z-50 rounded-2xl border-2 border-accent ring-4 ring-accent-soft transition-all duration-200"
        />
      )}

      {/* Compact bilingual-ready tooltip card */}
      <div
        style={tooltipStyle}
        className="fixed inset-x-3 z-50 mx-auto max-w-[400px] rounded-2xl border border-accent-border bg-elevated p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <span className={ui.badgeAccent}>
            <Sparkles size={11} aria-hidden="true" />
            {currentStep.badge}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex min-h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink"
          >
            Skip
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        <h3 className="mt-2 text-[15px] font-bold tracking-[-0.02em] text-ink">
          {currentStep.title}
        </h3>
        <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
          {currentStep.description}
        </p>

        {/* Progress dots + navigation */}
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-divider pt-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {TUTORIAL_STEPS.map((s, idx) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIndex
                    ? "w-5 bg-accent"
                    : idx < stepIndex
                      ? "w-1.5 bg-accent-border"
                      : "w-1.5 bg-line-strong"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((idx) => Math.max(0, idx - 1))}
                aria-label="Previous step"
                className={`${ui.btnSecondary} size-9 rounded-xl p-0`}
              >
                <ChevronLeft size={15} className="rtl:rotate-180" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={advance}
              className={`${ui.btnPrimary} min-h-9 rounded-xl px-3.5 text-[11px] font-semibold`}
            >
              {isLastStep ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={14} className="rtl:rotate-180" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
