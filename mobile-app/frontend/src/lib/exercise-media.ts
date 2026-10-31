export type ExerciseMediaType =
  | "mp4"
  | "webm"
  | "gif"
  | "image"
  | "svg_2d"
  | "none";

export type ExerciseMediaSource =
  | "builtin"
  | "local_asset"
  | "remote_url"
  | "provider";

export type ExerciseAnimationRig =
  | "bench_press"
  | "squat"
  | "deadlift"
  | "lat_pulldown"
  | "shoulder_press"
  | "bicep_curl"
  | "horizontal_row"
  | "tricep_pushdown"
  | "lateral_raise"
  | "lunge"
  | "hip_thrust"
  | "core_plank";

export type ExerciseMediaCatalogEntry = {
  exerciseKey: string;
  exerciseName: string;
  targetMuscleGroup?: string;
  equipment?: string;
  mediaType: ExerciseMediaType;
  mediaSource: ExerciseMediaSource;
  mediaUrl?: string;
  posterUrl?: string;
  providerName?: string;
  providerExerciseId?: string;
  animationKey?: string;
  formCue?: string;
  license?: string;
};

export type ResolvedExerciseMedia = {
  exerciseKey: string;
  exerciseName: string;
  targetMuscleGroup: string;
  equipment: string;
  mediaType: ExerciseMediaType;
  mediaSource: ExerciseMediaSource;
  mediaUrl: string;
  posterUrl: string;
  providerName: string;
  providerExerciseId: string;
  animationKey: ExerciseAnimationRig | null;
  fallbackAnimationKey: ExerciseAnimationRig | null;
  formCue: string;
  movementLabel: string;
  license: string;
};

export type ExerciseLibraryItem = {
  name: string;
  muscle: string;
  equipment: string;
  sets: number;
  reps: string;
  restSeconds: number;
  animationKey: ExerciseAnimationRig;
  formCue: string;
  aliases?: string[];
};

export type ExerciseMediaProviderAdapter = {
  id: string;
  name: string;
  resolve: (
    exerciseKey: string,
    exerciseName: string,
    targetMuscleGroup?: string,
  ) => Partial<ExerciseMediaCatalogEntry> | null;
};

export const EXERCISE_MEDIA_CACHE_KEY = "gymos_exercise_media_cache_v1";
const MAX_CACHED_MEDIA_ENTRIES = 240;

const RIG_LABELS: Record<ExerciseAnimationRig, string> = {
  bench_press: "Horizontal Press",
  squat: "Knee-Dominant Squat",
  deadlift: "Hip Hinge Pull",
  lat_pulldown: "Vertical Pull",
  shoulder_press: "Overhead Press",
  bicep_curl: "Elbow Flexion",
  horizontal_row: "Horizontal Row",
  tricep_pushdown: "Elbow Extension",
  lateral_raise: "Shoulder Abduction",
  lunge: "Unilateral Split",
  hip_thrust: "Hip Extension",
  core_plank: "Core Bracing",
};

const VALID_RIGS = new Set<string>(Object.keys(RIG_LABELS));

export const GYMOS_EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  {
    name: "Barbell Bench Press",
    muscle: "Chest",
    equipment: "Barbell",
    sets: 4,
    reps: "6-8",
    restSeconds: 120,
    animationKey: "bench_press",
    formCue: "Retract shoulder blades, lower bar with control to mid-chest, drive smoothly.",
    aliases: ["bench press", "flat barbell bench press", "dumbbell bench press"],
  },
  {
    name: "Incline Dumbbell Press",
    muscle: "Chest",
    equipment: "Dumbbells",
    sets: 3,
    reps: "8-10",
    restSeconds: 90,
    animationKey: "bench_press",
    formCue: "Set bench to 30 degrees, keep wrists stacked above elbows throughout each rep.",
    aliases: ["incline press", "incline bench press"],
  },
  {
    name: "Cable Chest Fly",
    muscle: "Chest",
    equipment: "Cables",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "bench_press",
    formCue: "Maintain a slight elbow bend and bring hands together in a smooth arc.",
    aliases: ["pec deck", "chest fly", "dumbbell fly"],
  },
  {
    name: "Push-Ups",
    muscle: "Chest",
    equipment: "Bodyweight",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "bench_press",
    formCue: "Brace core in a straight line from head to heels and lower chest with control.",
    aliases: ["push up", "pushup", "pushups"],
  },
  {
    name: "Barbell Back Squat",
    muscle: "Legs",
    equipment: "Barbell",
    sets: 4,
    reps: "6-8",
    restSeconds: 120,
    animationKey: "squat",
    formCue: "Brace torso, sit hips down between heels, keep knees tracking over toes.",
    aliases: ["squat", "back squat", "front squat", "barbell squat"],
  },
  {
    name: "Goblet Squat",
    muscle: "Legs",
    equipment: "Dumbbell",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "squat",
    formCue: "Hold weight close to sternum, keep chest tall, and pause briefly at depth.",
  },
  {
    name: "Leg Press",
    muscle: "Legs",
    equipment: "Machine",
    sets: 4,
    reps: "10-12",
    restSeconds: 90,
    animationKey: "squat",
    formCue: "Keep lower back pressed firmly into the pad and drive evenly through mid-foot.",
    aliases: ["seated leg curl", "leg extension", "standing calf raise"],
  },
  {
    name: "Deadlift",
    muscle: "Back",
    equipment: "Barbell",
    sets: 3,
    reps: "5",
    restSeconds: 150,
    animationKey: "deadlift",
    formCue: "Set lats tight, keep bar close to shins, push the floor away with neutral spine.",
    aliases: ["conventional deadlift", "sumo deadlift", "barbell deadlift"],
  },
  {
    name: "Romanian Deadlift",
    muscle: "Legs",
    equipment: "Barbell",
    sets: 3,
    reps: "8-10",
    restSeconds: 90,
    animationKey: "deadlift",
    formCue: "Hinge hips back with soft knees until hamstrings load, then drive hips through.",
    aliases: ["rdl", "dumbbell romanian deadlift"],
  },
  {
    name: "Lat Pulldown",
    muscle: "Back",
    equipment: "Cable Machine",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "lat_pulldown",
    formCue: "Draw elbows down toward your ribs while keeping ribs stacked and torso steady.",
    aliases: ["wide-grip lat pulldown", "close-grip lat pulldown"],
  },
  {
    name: "Pull-Ups",
    muscle: "Back",
    equipment: "Bodyweight",
    sets: 3,
    reps: "6-10",
    restSeconds: 90,
    animationKey: "lat_pulldown",
    formCue: "Initiate from shoulder blades, pull chest toward bar, and lower to full hang.",
    aliases: ["pull up", "chin-ups", "chin ups", "assisted pull-ups"],
  },
  {
    name: "Overhead Barbell Press",
    muscle: "Shoulders",
    equipment: "Barbell",
    sets: 3,
    reps: "6-8",
    restSeconds: 90,
    animationKey: "shoulder_press",
    formCue: "Squeeze glutes and core, press vertically past forehead, lock out over mid-foot.",
    aliases: ["shoulder press", "military press", "overhead press", "ohp"],
  },
  {
    name: "Seated Dumbbell Shoulder Press",
    muscle: "Shoulders",
    equipment: "Dumbbells",
    sets: 3,
    reps: "8-10",
    restSeconds: 75,
    animationKey: "shoulder_press",
    formCue: "Press dumbbells slightly inward at the top without arching your lower back.",
    aliases: ["dumbbell shoulder press", "arnold press"],
  },
  {
    name: "Dumbbell Lateral Raise",
    muscle: "Shoulders",
    equipment: "Dumbbells",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "lateral_raise",
    formCue: "Lead with elbows in the scapular plane and pause briefly at shoulder height.",
    aliases: ["lateral raise", "cable lateral raise", "side raise"],
  },
  {
    name: "Barbell Bicep Curl",
    muscle: "Arms",
    equipment: "Barbell",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "bicep_curl",
    formCue: "Pin upper arms by your sides, curl smoothly without torso swing, lower slowly.",
    aliases: ["bicep curl", "biceps curl", "dumbbell bicep curl", "ez-bar curl"],
  },
  {
    name: "Hammer Curl",
    muscle: "Arms",
    equipment: "Dumbbells",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "bicep_curl",
    formCue: "Keep neutral palms facing inward and control the eccentric all the way down.",
    aliases: ["preacher curl", "incline dumbbell curl"],
  },
  {
    name: "Seated Cable Row",
    muscle: "Back",
    equipment: "Cable Machine",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "horizontal_row",
    formCue: "Sit tall, drive elbows past torso, squeeze mid-back, and let scapulae protract cleanly.",
    aliases: ["cable row", "machine row", "face pull"],
  },
  {
    name: "Bent-Over Barbell Row",
    muscle: "Back",
    equipment: "Barbell",
    sets: 4,
    reps: "8-10",
    restSeconds: 90,
    animationKey: "horizontal_row",
    formCue: "Hold a stable hip hinge and row the bar toward your lower sternum.",
    aliases: ["barbell row", "one-arm dumbbell row", "dumbbell row", "t-bar row"],
  },
  {
    name: "Tricep Rope Pushdown",
    muscle: "Arms",
    equipment: "Cable Machine",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "tricep_pushdown",
    formCue: "Keep elbows tucked at your sides and spread the rope gently at full extension.",
    aliases: ["tricep pushdown", "overhead tricep extension", "skull crushers", "dips"],
  },
  {
    name: "Walking Lunges",
    muscle: "Legs",
    equipment: "Dumbbells",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "lunge",
    formCue: "Step long enough for a 90-degree front knee angle and push up through front heel.",
    aliases: ["lunges", "bulgarian split squat", "reverse lunges", "split squat"],
  },
  {
    name: "Barbell Hip Thrust",
    muscle: "Legs",
    equipment: "Barbell",
    sets: 3,
    reps: "8-12",
    restSeconds: 90,
    animationKey: "hip_thrust",
    formCue: "Keep chin tucked, shins vertical at lockout, and pause 1 second at full glute squeeze.",
    aliases: ["hip thrust", "glute bridge"],
  },
  {
    name: "Seated Leg Curl",
    muscle: "Legs",
    equipment: "Machine",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "squat",
    formCue: "Align knee joint with machine pivot and control the return phase.",
  },
  {
    name: "Standing Calf Raise",
    muscle: "Legs",
    equipment: "Machine",
    sets: 4,
    reps: "12-15",
    restSeconds: 45,
    animationKey: "squat",
    formCue: "Use a full stretch at the bottom and pause cleanly on the balls of your feet.",
  },
  {
    name: "Face Pull",
    muscle: "Shoulders",
    equipment: "Cable Machine",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "horizontal_row",
    formCue: "Pull rope toward forehead while externally rotating thumbs behind ears.",
  },
  {
    name: "Overhead Tricep Extension",
    muscle: "Arms",
    equipment: "Cable / Dumbbell",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "tricep_pushdown",
    formCue: "Keep ribs down and stretch triceps fully behind head before extending.",
  },
  {
    name: "Plank",
    muscle: "Core",
    equipment: "Bodyweight",
    sets: 3,
    reps: "45s",
    restSeconds: 45,
    animationKey: "core_plank",
    formCue: "Stack elbows under shoulders, tuck pelvis slightly, and breathe steadily behind brace.",
    aliases: ["front plank", "side plank"],
  },
  {
    name: "Hanging Leg Raise",
    muscle: "Core",
    equipment: "Pull-Up Bar",
    sets: 3,
    reps: "10-15",
    restSeconds: 60,
    animationKey: "core_plank",
    formCue: "Curl pelvis upward with control rather than swinging legs with momentum.",
    aliases: ["leg raise", "cable crunch", "ab wheel rollout"],
  },
];

export function normalizeExerciseKey(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

const BUILTIN_LOOKUP: Map<string, ExerciseLibraryItem> = (() => {
  const map = new Map<string, ExerciseLibraryItem>();
  for (const item of GYMOS_EXERCISE_LIBRARY) {
    map.set(normalizeExerciseKey(item.name), item);
    for (const alias of item.aliases ?? []) {
      const k = normalizeExerciseKey(alias);
      if (k && !map.has(k)) {
        map.set(k, item);
      }
    }
  }
  return map;
})();

const providerAdapters: ExerciseMediaProviderAdapter[] = [];
const failedMediaUrls = new Set<string>();
let memoryResolvedCache: Record<string, ResolvedExerciseMedia> | null = null;

function readCachedMap(): Record<string, ResolvedExerciseMedia> {
  if (memoryResolvedCache) return memoryResolvedCache;
  if (typeof window === "undefined") {
    memoryResolvedCache = {};
    return memoryResolvedCache;
  }
  try {
    const raw = window.localStorage.getItem(EXERCISE_MEDIA_CACHE_KEY);
    if (!raw) {
      memoryResolvedCache = {};
      return memoryResolvedCache;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      memoryResolvedCache = parsed as Record<string, ResolvedExerciseMedia>;
      return memoryResolvedCache;
    }
  } catch {
    // Ignore storage quota or malformed JSON
  }
  memoryResolvedCache = {};
  return memoryResolvedCache;
}

function writeCachedMap(map: Record<string, ResolvedExerciseMedia>): void {
  const keys = Object.keys(map);
  if (keys.length > MAX_CACHED_MEDIA_ENTRIES) {
    const trimmed: Record<string, ResolvedExerciseMedia> = {};
    for (const k of keys.slice(keys.length - MAX_CACHED_MEDIA_ENTRIES)) {
      trimmed[k] = map[k];
    }
    memoryResolvedCache = trimmed;
  } else {
    memoryResolvedCache = map;
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      EXERCISE_MEDIA_CACHE_KEY,
      JSON.stringify(memoryResolvedCache),
    );
  } catch {
    // Ignore private-mode storage quota errors
  }
}

export function registerExerciseMediaAdapter(
  adapter: ExerciseMediaProviderAdapter,
): void {
  const idx = providerAdapters.findIndex((a) => a.id === adapter.id);
  if (idx >= 0) {
    providerAdapters[idx] = adapter;
  } else {
    providerAdapters.push(adapter);
  }
  memoryResolvedCache = {};
}

export function unregisterExerciseMediaAdapter(adapterId: string): void {
  const idx = providerAdapters.findIndex((a) => a.id === adapterId);
  if (idx >= 0) {
    providerAdapters.splice(idx, 1);
    memoryResolvedCache = {};
  }
}

export function listExerciseMediaAdapters(): string[] {
  return providerAdapters.map((a) => a.id);
}

export function markExerciseMediaUrlFailed(url: string): void {
  const trimmed = (url || "").trim();
  if (!trimmed) return;
  failedMediaUrls.add(trimmed);
}

export function isExerciseMediaUrlFailed(url: string): boolean {
  return failedMediaUrls.has((url || "").trim());
}

export function inferAnimationRig(
  exerciseName: string,
  explicitKey?: string,
): ExerciseAnimationRig | null {
  if (explicitKey && VALID_RIGS.has(explicitKey)) {
    return explicitKey as ExerciseAnimationRig;
  }
  const key = normalizeExerciseKey(exerciseName);
  const direct = BUILTIN_LOOKUP.get(key);
  if (direct) return direct.animationKey;

  if (/(deadlift|rdl|good morning|rack pull|kettlebell swing)/.test(key)) return "deadlift";
  if (/(hip thrust|glute bridge|glute kickback|hip abduction)/.test(key)) return "hip_thrust";
  if (/(lunge|split squat|step-up|step up)/.test(key)) return "lunge";
  if (/(squat|leg press|hack squat|leg extension|leg curl|calf)/.test(key)) {
    return "squat";
  }
  if (/(pulldown|pull-up|pull up|pullup|chin-up|chin up)/.test(key)) {
    return "lat_pulldown";
  }
  if (/(lateral raise|side raise|front raise|rear delt)/.test(key)) {
    return "lateral_raise";
  }
  if (/(shoulder press|overhead press|military press|arnold press|ohp)/.test(key)) {
    return "shoulder_press";
  }
  if (/(bench|chest press|incline press|push-up|push up|pushup|chest fly|pec deck)/.test(key)) {
    return "bench_press";
  }
  if (/(curl|bicep)/.test(key)) return "bicep_curl";
  if (/(tricep|pushdown|skull crusher|dip|kickback)/.test(key)) {
    return "tricep_pushdown";
  }
  if (/(row|face pull|shrug)/.test(key)) return "horizontal_row";
  if (/(plank|crunch|sit-up|sit up|leg raise|ab wheel|hollow hold|dead bug)/.test(key)) {
    return "core_plank";
  }
  return null;
}

export function resolveExerciseMedia(
  exerciseName: string,
  targetMuscleGroup?: string,
  remoteCatalog?: Record<string, ExerciseMediaCatalogEntry> | null,
): ResolvedExerciseMedia {
  const cleanName = (exerciseName || "").trim() || "Exercise";
  const exerciseKey = normalizeExerciseKey(cleanName);
  const builtin = BUILTIN_LOOKUP.get(exerciseKey) ?? null;
  const inferredRig = inferAnimationRig(cleanName);
  const catalogHit = remoteCatalog ? remoteCatalog[exerciseKey] ?? null : null;

  // Check registered external provider adapters if no backend catalog override exists
  let adapterHit: Partial<ExerciseMediaCatalogEntry> | null = null;
  if (!catalogHit && providerAdapters.length > 0) {
    for (const adapter of providerAdapters) {
      const candidate = adapter.resolve(
        exerciseKey,
        cleanName,
        targetMuscleGroup,
      );
      if (candidate) {
        adapterHit = candidate;
        break;
      }
    }
  }

  const external = catalogHit ?? adapterHit;
  if (!external) {
    const cache = readCachedMap();
    const cached = cache[exerciseKey];
    if (cached && cached.exerciseName === cleanName) {
      return cached;
    }
  }

  const rigFromExternal =
    external?.animationKey && VALID_RIGS.has(external.animationKey)
      ? (external.animationKey as ExerciseAnimationRig)
      : null;

  const fallbackAnimationKey = rigFromExternal ?? inferredRig;
  const mediaUrl = (external?.mediaUrl || "").trim();
  const urlUsable = Boolean(mediaUrl) && !isExerciseMediaUrlFailed(mediaUrl);

  let mediaType: ExerciseMediaType = external?.mediaType ?? (fallbackAnimationKey ? "svg_2d" : "none");
  if (
    (mediaType === "mp4" ||
      mediaType === "webm" ||
      mediaType === "gif" ||
      mediaType === "image") &&
    !urlUsable
  ) {
    mediaType = fallbackAnimationKey ? "svg_2d" : "none";
  } else if (mediaType === "svg_2d" && !fallbackAnimationKey) {
    mediaType = "none";
  }

  const animationKey =
    mediaType === "svg_2d" ? fallbackAnimationKey : fallbackAnimationKey;

  const movementLabel = animationKey
    ? RIG_LABELS[animationKey]
    : (targetMuscleGroup || builtin?.muscle || "Movement Guide").trim();

  const resolved: ResolvedExerciseMedia = {
    exerciseKey,
    exerciseName: cleanName,
    targetMuscleGroup:
      (
        external?.targetMuscleGroup ||
        targetMuscleGroup ||
        builtin?.muscle ||
        "Full body"
      ).trim(),
    equipment: (external?.equipment || builtin?.equipment || "Gym Equipment").trim(),
    mediaType,
    mediaSource:
      external?.mediaSource ??
      (urlUsable
        ? mediaUrl.startsWith("/")
          ? "local_asset"
          : "remote_url"
        : "builtin"),
    mediaUrl: urlUsable ? mediaUrl : "",
    posterUrl: (external?.posterUrl || "").trim(),
    providerName: (external?.providerName || "gymos-2d").trim(),
    providerExerciseId: (external?.providerExerciseId || "").trim(),
    animationKey,
    fallbackAnimationKey,
    formCue:
      (
        external?.formCue ||
        builtin?.formCue ||
        (animationKey
          ? "Move through a controlled range of motion with steady breathing."
          : "No visual demo linked yet — use controlled tempo and comfortable range of motion.")
      ).trim(),
    movementLabel,
    license: (external?.license || "GymOS First-Party Vector").trim(),
  };

  if (!external) {
    const cache = readCachedMap();
    cache[exerciseKey] = resolved;
    writeCachedMap(cache);
  }

  return resolved;
}
