"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  markExerciseMediaUrlFailed,
  resolveExerciseMedia,
  type ExerciseAnimationRig,
  type ExerciseMediaCatalogEntry,
} from "@/lib/exercise-media";
import { ui } from "@/lib/theme";

type ExerciseDemoVisualProps = {
  exerciseName: string;
  muscle?: string;
  targetMuscleGroup?: string;
  mediaCatalog?: Record<string, ExerciseMediaCatalogEntry> | null;
  compact?: boolean;
};

function VectorRigSvg({
  rig,
  paused,
  compact,
}: {
  rig: ExerciseAnimationRig;
  paused: boolean;
  compact: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    try {
      if (paused && typeof el.pauseAnimations === "function") {
        el.pauseAnimations();
      } else if (!paused && typeof el.unpauseAnimations === "function") {
        el.unpauseAnimations();
      }
    } catch {
      // Ignore browsers without SMIL control methods
    }
  }, [paused, rig]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 88 88"
      className={compact ? "h-14 w-14 text-accent-text" : "h-16 w-16 text-accent-text"}
      aria-hidden="true"
    >
      {/* Subtle floor & guide axis */}
      <line
        x1="12"
        y1="74"
        x2="76"
        y2="74"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {rig === "bench_press" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Bench */}
          <line x1="18" y1="56" x2="66" y2="56" strokeOpacity="0.45" strokeWidth="3.5" />
          <line x1="26" y1="56" x2="26" y2="74" strokeOpacity="0.35" strokeWidth="2.5" />
          <line x1="58" y1="56" x2="58" y2="74" strokeOpacity="0.35" strokeWidth="2.5" />
          {/* Athlete torso + head + legs */}
          <circle cx="24" cy="49" r="4.5" strokeOpacity="0.7" strokeWidth="2.2" />
          <path d="M30 50 H56 L66 62 L68 73" strokeOpacity="0.65" strokeWidth="2.6" />
          {/* Pressing arms + barbell */}
          <g>
            <line x1="36" y1="50" x2="36" y2="30" strokeWidth="2.8">
              <animate attributeName="y2" values="42;24;42" dur="2.1s" repeatCount="indefinite" />
            </line>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 12; 0 -6; 0 12"
                dur="2.1s"
                repeatCount="indefinite"
              />
              <line x1="20" y1="30" x2="52" y2="30" strokeWidth="3" />
              <rect x="17" y="24" width="4" height="12" rx="1.5" fill="currentColor" />
              <rect x="51" y="24" width="4" height="12" rx="1.5" fill="currentColor" />
            </g>
          </g>
        </g>
      )}

      {rig === "squat" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Squatting upper body + barbell */}
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0; 0 13; 0 0"
              dur="2.2s"
              repeatCount="indefinite"
            />
            <circle cx="44" cy="21" r="5" strokeWidth="2.4" />
            <line x1="22" y1="29" x2="66" y2="29" strokeWidth="3" />
            <rect x="19" y="23" width="4" height="12" rx="1.5" fill="currentColor" />
            <rect x="65" y="23" width="4" height="12" rx="1.5" fill="currentColor" />
            <line x1="44" y1="26" x2="42" y2="48" strokeWidth="3" />
          </g>
          {/* Knee-dominant lower body */}
          <path d="M42 48 L33 61 L35 73" strokeWidth="2.8">
            <animate
              attributeName="d"
              values="M42 48 L39 61 L38 73; M42 61 L29 63 L36 73; M42 48 L39 61 L38 73"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </path>
          <path d="M42 48 L51 61 L50 73" strokeWidth="2.8" strokeOpacity="0.65">
            <animate
              attributeName="d"
              values="M42 48 L47 61 L48 73; M42 61 L55 63 L50 73; M42 48 L47 61 L48 73"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}

      {rig === "deadlift" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Shins + thighs */}
          <path d="M38 73 L40 58 L36 46" strokeWidth="2.8">
            <animate
              attributeName="d"
              values="M38 73 L42 60 L34 50; M38 73 L40 57 L42 44; M38 73 L42 60 L34 50"
              dur="2.3s"
              repeatCount="indefinite"
            />
          </path>
          {/* Hinged spine + head */}
          <path d="M34 50 L50 34" strokeWidth="3">
            <animate
              attributeName="d"
              values="M34 50 L52 36; M42 44 L44 25; M34 50 L52 36"
              dur="2.3s"
              repeatCount="indefinite"
            />
          </path>
          <circle cx="55" cy="31" r="4.5" strokeWidth="2.3">
            <animate attributeName="cx" values="55;44;55" dur="2.3s" repeatCount="indefinite" />
            <animate attributeName="cy" values="32;19;32" dur="2.3s" repeatCount="indefinite" />
          </circle>
          {/* Arms + rising barbell */}
          <line x1="48" y1="38" x2="48" y2="62" strokeWidth="2.4" strokeOpacity="0.8">
            <animate attributeName="x1" values="50;44;50" dur="2.3s" repeatCount="indefinite" />
            <animate attributeName="y1" values="38;28;38" dur="2.3s" repeatCount="indefinite" />
            <animate attributeName="x2" values="48;46;48" dur="2.3s" repeatCount="indefinite" />
            <animate attributeName="y2" values="64;47;64" dur="2.3s" repeatCount="indefinite" />
          </line>
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0; -2 -17; 0 0"
              dur="2.3s"
              repeatCount="indefinite"
            />
            <circle cx="48" cy="64" r="7" strokeWidth="2.8" />
            <circle cx="48" cy="64" r="2" fill="currentColor" />
          </g>
        </g>
      )}

      {rig === "lat_pulldown" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Overhead pulley cable */}
          <line x1="44" y1="10" x2="44" y2="34" strokeOpacity="0.4" strokeWidth="2" />
          {/* Seated torso */}
          <circle cx="44" cy="40" r="4.5" strokeWidth="2.3" />
          <path d="M44 45 V61 H57 V73" strokeOpacity="0.72" strokeWidth="2.8" />
          {/* Bar + pulling elbows */}
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0; 0 15; 0 0"
              dur="2.1s"
              repeatCount="indefinite"
            />
            <line x1="20" y1="21" x2="68" y2="21" strokeWidth="3" />
          </g>
          <path d="M27 21 L36 37 L44 46" strokeWidth="2.5">
            <animate
              attributeName="d"
              values="M26 21 L34 33 L44 46; M28 36 L34 49 L44 46; M26 21 L34 33 L44 46"
              dur="2.1s"
              repeatCount="indefinite"
            />
          </path>
          <path d="M61 21 L52 37 L44 46" strokeWidth="2.5">
            <animate
              attributeName="d"
              values="M62 21 L54 33 L44 46; M60 36 L54 49 L44 46; M62 21 L54 33 L44 46"
              dur="2.1s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}

      {rig === "shoulder_press" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="44" cy="36" r="4.8" strokeWidth="2.3" />
          <path d="M44 42 V60 M44 60 L38 73 M44 60 L50 73" strokeOpacity="0.72" strokeWidth="2.8" />
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 16; 0 0; 0 16"
              dur="2.0s"
              repeatCount="indefinite"
            />
            <line x1="20" y1="18" x2="68" y2="18" strokeWidth="3" />
            <rect x="17" y="13" width="4" height="10" rx="1.5" fill="currentColor" />
            <rect x="67" y="13" width="4" height="10" rx="1.5" fill="currentColor" />
          </g>
          <path d="M37 44 L30 34 L28 18" strokeWidth="2.5">
            <animate
              attributeName="d"
              values="M38 44 L29 44 L28 34; M38 44 L31 30 L28 18; M38 44 L29 44 L28 34"
              dur="2.0s"
              repeatCount="indefinite"
            />
          </path>
          <path d="M51 44 L58 34 L60 18" strokeWidth="2.5">
            <animate
              attributeName="d"
              values="M50 44 L59 44 L60 34; M50 44 L57 30 L60 18; M50 44 L59 44 L60 34"
              dur="2.0s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}

      {rig === "bicep_curl" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="38" cy="22" r="5" strokeWidth="2.3" />
          <path d="M38 28 V54 L34 73 M38 54 L43 73" strokeOpacity="0.72" strokeWidth="2.8" />
          {/* Pinned upper arm */}
          <line x1="40" y1="31" x2="42" y2="47" strokeWidth="3" />
          {/* Curling forearm + dumbbell */}
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="68 42 47; -52 42 47; 68 42 47"
              dur="1.9s"
              repeatCount="indefinite"
            />
            <line x1="42" y1="47" x2="58" y2="47" strokeWidth="3" />
            <rect x="56" y="41" width="5" height="12" rx="2" fill="currentColor" />
          </g>
        </g>
      )}

      {rig === "horizontal_row" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Cable line */}
          <line x1="72" y1="45" x2="46" y2="45" strokeOpacity="0.38" strokeWidth="2">
            <animate attributeName="x2" values="56;38;56" dur="2.0s" repeatCount="indefinite" />
          </line>
          <circle cx="32" cy="27" r="4.8" strokeWidth="2.3" />
          <path d="M32 33 V57 L54 57 L62 73" strokeOpacity="0.72" strokeWidth="2.8" />
          {/* Rowing arm */}
          <path d="M32 39 L44 45 L56 45" strokeWidth="3">
            <animate
              attributeName="d"
              values="M32 39 L46 44 L56 45; M32 39 L24 46 L38 45; M32 39 L46 44 L56 45"
              dur="2.0s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}

      {rig === "tricep_pushdown" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <line x1="56" y1="12" x2="52" y2="42" strokeOpacity="0.38" strokeWidth="2" />
          <circle cx="35" cy="22" r="4.8" strokeWidth="2.3" />
          <path d="M35 28 L37 54 L33 73 M37 54 L42 73" strokeOpacity="0.72" strokeWidth="2.8" />
          <line x1="37" y1="31" x2="42" y2="46" strokeWidth="3" />
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-42 42 46; 68 42 46; -42 42 46"
              dur="1.9s"
              repeatCount="indefinite"
            />
            <line x1="42" y1="46" x2="57" y2="46" strokeWidth="3" />
            <circle cx="58" cy="46" r="2.6" fill="currentColor" />
          </g>
        </g>
      )}

      {rig === "lateral_raise" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="44" cy="23" r="4.8" strokeWidth="2.3" />
          <path d="M44 29 V54 M44 54 L39 73 M44 54 L49 73" strokeOpacity="0.72" strokeWidth="2.8" />
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="62 40 33; 4 40 33; 62 40 33"
              dur="2.0s"
              repeatCount="indefinite"
            />
            <line x1="40" y1="33" x2="20" y2="33" strokeWidth="2.8" />
            <circle cx="19" cy="33" r="2.8" fill="currentColor" />
          </g>
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-62 48 33; -4 48 33; -62 48 33"
              dur="2.0s"
              repeatCount="indefinite"
            />
            <line x1="48" y1="33" x2="68" y2="33" strokeWidth="2.8" />
            <circle cx="69" cy="33" r="2.8" fill="currentColor" />
          </g>
        </g>
      )}

      {rig === "lunge" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0; 0 10; 0 0"
              dur="2.2s"
              repeatCount="indefinite"
            />
            <circle cx="44" cy="20" r="4.6" strokeWidth="2.3" />
            <line x1="44" y1="25" x2="44" y2="47" strokeWidth="3" />
          </g>
          <path d="M44 47 L58 58 L58 73" strokeWidth="2.8">
            <animate
              attributeName="d"
              values="M44 47 L55 59 L58 73; M44 57 L60 57 L58 73; M44 47 L55 59 L58 73"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </path>
          <path d="M44 47 L31 60 L24 73" strokeWidth="2.8" strokeOpacity="0.68">
            <animate
              attributeName="d"
              values="M44 47 L34 60 L25 73; M44 57 L33 70 L23 73; M44 47 L34 60 L25 73"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}

      {rig === "hip_thrust" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Bench support */}
          <rect x="14" y="48" width="16" height="25" rx="3" strokeOpacity="0.4" strokeWidth="2.2" />
          <circle cx="23" cy="41" r="4.4" strokeWidth="2.2" />
          {/* Torso + hip bridge + shin */}
          <path d="M27 46 L48 58 L64 52 L64 73" strokeWidth="3">
            <animate
              attributeName="d"
              values="M27 47 L48 63 L64 52 L64 73; M27 47 L48 47 L64 47 L64 73; M27 47 L48 63 L64 52 L64 73"
              dur="2.1s"
              repeatCount="indefinite"
            />
          </path>
          {/* Barbell over hips */}
          <circle cx="48" cy="55" r="4.5" fill="currentColor">
            <animate attributeName="cy" values="60;44;60" dur="2.1s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {rig === "core_plank" && (
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0; 0 -2; 0 0"
              dur="2.4s"
              repeatCount="indefinite"
            />
            <circle cx="67" cy="46" r="4.4" strokeWidth="2.2" />
            <line x1="18" y1="62" x2="62" y2="49" strokeWidth="3.2" />
            <path d="M58 50 L58 72 L66 72" strokeWidth="2.6" />
            <line x1="18" y1="62" x2="16" y2="73" strokeWidth="2.6" />
          </g>
        </g>
      )}
    </svg>
  );
}

export function ExerciseDemoVisual({
  exerciseName,
  muscle,
  targetMuscleGroup,
  mediaCatalog = null,
  compact = false,
}: ExerciseDemoVisualProps) {
  const effectiveMuscle = targetMuscleGroup ?? muscle;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [pageHidden, setPageHidden] = useState<boolean>(() =>
    typeof document !== "undefined" ? document.visibilityState === "hidden" : false,
  );
  const [inViewport, setInViewport] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const media = useMemo(
    () => resolveExerciseMedia(exerciseName, effectiveMuscle, mediaCatalog),
    // Re-resolve when exerciseName, muscle, catalog, or failedUrl changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exerciseName, effectiveMuscle, mediaCatalog, failedUrl],
  );

  // Automatically pause animations/videos when app goes to background
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      setPageHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Respect OS reduced-motion setting
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Pause offscreen animations when scrolled away
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInViewport(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effectivelyPaused = userPaused || pageHidden || !inViewport || reducedMotion;

  // Sync HTML5 video play/pause state cleanly
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (effectivelyPaused) {
      vid.pause();
    } else {
      vid.play().catch(() => {
        // Autoplay restriction fallback — leave paused cleanly
      });
    }
  }, [effectivelyPaused, media.mediaUrl, media.mediaType]);

  const handleMediaLoadError = () => {
    if (media.mediaUrl) {
      markExerciseMediaUrlFailed(media.mediaUrl);
      setFailedUrl(media.mediaUrl);
    }
  };

  const isVideo =
    (media.mediaType === "mp4" || media.mediaType === "webm") &&
    Boolean(media.mediaUrl);
  const isImageOrGif =
    (media.mediaType === "gif" || media.mediaType === "image") &&
    Boolean(media.mediaUrl);
  const activeRig =
    media.mediaType === "svg_2d" ? media.animationKey : null;
  const hasAnimatedVisual =
    isVideo || media.mediaType === "gif" || Boolean(activeRig);

  return (
    <div
      ref={containerRef}
      data-testid="exercise-demo-visual"
      data-media-type={media.mediaType}
      className={`flex items-center gap-3 rounded-2xl border border-line bg-subtle ${
        compact ? "px-3 py-2" : "px-3.5 py-2.5"
      }`}
    >
      {/* Visual Box */}
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface ${
          compact ? "h-14 w-14" : "h-16 w-16"
        }`}
      >
        {isVideo && inViewport ? (
          <video
            ref={videoRef}
            src={media.mediaUrl}
            poster={media.posterUrl || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            onError={handleMediaLoadError}
            className="h-full w-full object-cover"
          />
        ) : isImageOrGif ? (
          effectivelyPaused && media.mediaType === "gif" && !media.posterUrl ? (
            activeRig || media.fallbackAnimationKey ? (
              <VectorRigSvg
                rig={(activeRig ?? media.fallbackAnimationKey)!}
                paused={true}
                compact={compact}
              />
            ) : (
              <span className="px-1 text-center text-[10px] font-semibold text-ink-muted">
                Paused
              </span>
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                effectivelyPaused && media.posterUrl
                  ? media.posterUrl
                  : media.mediaUrl
              }
              alt={`${media.exerciseName} demonstration`}
              loading="lazy"
              decoding="async"
              onError={handleMediaLoadError}
              className="h-full w-full object-cover"
            />
          )
        ) : activeRig ? (
          <VectorRigSvg
            rig={activeRig}
            paused={effectivelyPaused}
            compact={compact}
          />
        ) : (
          /* Clean missing-media placeholder */
          <div className="flex flex-col items-center justify-center px-1 text-center text-ink-muted">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 opacity-70"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
            </svg>
            <span className="mt-0.5 text-[9px] font-semibold leading-tight">
              No clip
            </span>
          </div>
        )}
      </div>

      {/* Exercise Form Cue & Metadata */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={ui.badgeAccent}>{media.movementLabel}</span>
            {media.equipment ? (
              <span className="truncate text-[10px] font-semibold text-ink-muted">
                {`· ${media.equipment}`}
              </span>
            ) : null}
          </div>

          {hasAnimatedVisual ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUserPaused((prev) => !prev);
              }}
              className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-secondary transition hover:bg-hover"
            >
              {userPaused ? "Play" : "Pause"}
            </button>
          ) : (
            <span className={ui.badgeNeutral}>Form cue</span>
          )}
        </div>
        <p
          className={`mt-1 leading-snug text-ink-secondary ${
            compact ? "line-clamp-2 text-[11px]" : "text-xs"
          }`}
        >
          {media.formCue}
        </p>
      </div>
    </div>
  );
}
