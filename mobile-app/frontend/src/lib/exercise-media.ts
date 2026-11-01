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
  arabicName: string;
  muscle: string;
  equipment: string;
  sets: number;
  reps: string;
  restSeconds: number;
  animationKey: ExerciseAnimationRig;
  formCue: string;
  aliases?: string[];
  arabicAliases?: string[];
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
    arabicName: "ضغط الصدر بالبار",
    muscle: "Chest",
    equipment: "Barbell",
    sets: 4,
    reps: "6-8",
    restSeconds: 120,
    animationKey: "bench_press",
    formCue: "Retract shoulder blades, lower bar with control to mid-chest, drive smoothly.",
    aliases: ["bench press", "flat barbell bench press", "dumbbell bench press"],
    arabicAliases: ["بنش برس", "بنش مستوي", "ضغط صدر", "صدر بار"],
  },
  {
    name: "Incline Dumbbell Press",
    arabicName: "ضغط الصدر العالي بالدمبل",
    muscle: "Chest",
    equipment: "Dumbbells",
    sets: 3,
    reps: "8-10",
    restSeconds: 90,
    animationKey: "bench_press",
    formCue: "Set bench to 30 degrees, keep wrists stacked above elbows throughout each rep.",
    aliases: ["incline press", "incline bench press", "incline dumbbell bench press"],
    arabicAliases: ["صدر عالي", "انكلاين دمبل", "ضغط عالي بالدمبل"],
  },
  {
    name: "Cable Chest Fly",
    arabicName: "تفتيح الصدر بالكيبل",
    muscle: "Chest",
    equipment: "Cables",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "bench_press",
    formCue: "Maintain a slight elbow bend and bring hands together in a smooth arc.",
    aliases: ["pec deck", "chest fly", "dumbbell fly", "cable crossover"],
    arabicAliases: ["تفتيح صدر", "فلاي كيبل", "فراشة صدر"],
  },
  {
    name: "Push-Ups",
    arabicName: "تمرين الضغط",
    muscle: "Chest",
    equipment: "Bodyweight",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "bench_press",
    formCue: "Brace core in a straight line from head to heels and lower chest with control.",
    aliases: ["push up", "push-up", "pushup", "pushups"],
    arabicAliases: ["ضغط أرضي", "بوش اب", "ضغط وزن الجسم"],
  },
  {
    name: "Barbell Back Squat",
    arabicName: "القرفصاء بالبار (سكوات)",
    muscle: "Legs",
    equipment: "Barbell",
    sets: 4,
    reps: "6-8",
    restSeconds: 120,
    animationKey: "squat",
    formCue: "Brace torso, sit hips down between heels, keep knees tracking over toes.",
    aliases: ["squat", "back squat", "front squat", "barbell squat"],
    arabicAliases: ["القرفصاء", "سكوات", "قرفصاء خلفي", "رجل بار"],
  },
  {
    name: "Goblet Squat",
    arabicName: "قرفصاء الجوبلت بالدمبل",
    muscle: "Legs",
    equipment: "Dumbbell",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "squat",
    formCue: "Hold weight close to sternum, keep chest tall, and pause briefly at depth.",
    arabicAliases: ["جوبلت سكوات", "قرفصاء أمامي بالدمبل", "سكوات دمبل"],
  },
  {
    name: "Leg Press",
    arabicName: "دفع الأرجل على الجهاز",
    muscle: "Legs",
    equipment: "Machine",
    sets: 4,
    reps: "10-12",
    restSeconds: 90,
    animationKey: "squat",
    formCue: "Keep lower back pressed firmly into the pad and drive evenly through mid-foot.",
    aliases: ["seated leg curl", "leg extension", "standing calf raise"],
    arabicAliases: ["مكبس الأرجل", "ليج برس", "دفع رجل جهاز"],
  },
  {
    name: "Deadlift",
    arabicName: "الرفعة المميتة بالبار",
    muscle: "Back",
    equipment: "Barbell",
    sets: 3,
    reps: "5",
    restSeconds: 150,
    animationKey: "deadlift",
    formCue: "Set lats tight, keep bar close to shins, push the floor away with neutral spine.",
    aliases: ["conventional deadlift", "sumo deadlift", "barbell deadlift"],
    arabicAliases: ["ديدليفت", "قطنية بالبار", "رفعة مميتة"],
  },
  {
    name: "Romanian Deadlift",
    arabicName: "الرفعة المميتة الرومانية",
    muscle: "Legs",
    equipment: "Barbell",
    sets: 3,
    reps: "8-10",
    restSeconds: 90,
    animationKey: "deadlift",
    formCue: "Hinge hips back with soft knees until hamstrings load, then drive hips through.",
    aliases: ["rdl", "dumbbell romanian deadlift"],
    arabicAliases: ["ديدليفت روماني", "خلفيات بالبار", "رفعة رومانية"],
  },
  {
    name: "Lat Pulldown",
    arabicName: "سحب أمامي للظهر",
    muscle: "Back",
    equipment: "Cable Machine",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "lat_pulldown",
    formCue: "Draw elbows down toward your ribs while keeping ribs stacked and torso steady.",
    aliases: ["wide-grip lat pulldown", "close-grip lat pulldown"],
    arabicAliases: ["سحب عالي للظهر", "سحب أمامي عالي", "مجنص سحب عالي", "ظهر سحب"],
  },
  {
    name: "Pull-Ups",
    arabicName: "العقلة",
    muscle: "Back",
    equipment: "Bodyweight",
    sets: 3,
    reps: "6-10",
    restSeconds: 90,
    animationKey: "lat_pulldown",
    formCue: "Initiate from shoulder blades, pull chest toward bar, and lower to full hang.",
    aliases: ["pull up", "pull-up", "chin-ups", "chin ups", "assisted pull-ups", "weighted pull-ups"],
    arabicAliases: ["عقلة", "سحب عقلة", "ظهر عقلة"],
  },
  {
    name: "Overhead Barbell Press",
    arabicName: "ضغط الأكتاف بالبار واقفاً",
    muscle: "Shoulders",
    equipment: "Barbell",
    sets: 3,
    reps: "6-8",
    restSeconds: 90,
    animationKey: "shoulder_press",
    formCue: "Squeeze glutes and core, press vertically past forehead, lock out over mid-foot.",
    aliases: ["shoulder press", "military press", "overhead press", "ohp", "barbell overhead press"],
    arabicAliases: ["ضغط كتف بالبار", "بار أمامي كتف", "أكتاف بالبار"],
  },
  {
    name: "Seated Dumbbell Shoulder Press",
    arabicName: "ضغط الأكتاف بالدمبل جالساً",
    muscle: "Shoulders",
    equipment: "Dumbbells",
    sets: 3,
    reps: "8-10",
    restSeconds: 75,
    animationKey: "shoulder_press",
    formCue: "Press dumbbells slightly inward at the top without arching your lower back.",
    aliases: ["dumbbell shoulder press", "arnold press"],
    arabicAliases: ["تجميع كتف بالدمبل", "ضغط أكتاف دمبل", "كتف جالس دمبل"],
  },
  {
    name: "Dumbbell Lateral Raise",
    arabicName: "رفرفة جانبية للأكتاف بالدمبل",
    muscle: "Shoulders",
    equipment: "Dumbbells",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "lateral_raise",
    formCue: "Lead with elbows in the scapular plane and pause briefly at shoulder height.",
    aliases: ["lateral raise", "cable lateral raise", "side raise", "seated lateral raises"],
    arabicAliases: ["رفرفة جانبي", "كتف جانبي دمبل", "رفرفة أكتاف"],
  },
  {
    name: "Barbell Bicep Curl",
    arabicName: "ثني الذراع للبايسبس بالبار",
    muscle: "Arms",
    equipment: "Barbell",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "bicep_curl",
    formCue: "Pin upper arms by your sides, curl smoothly without torso swing, lower slowly.",
    aliases: ["bicep curl", "biceps curl", "dumbbell bicep curl", "ez-bar curl"],
    arabicAliases: ["ثني الذراع للبايسبس", "باي بالبار", "مرجحة بايسبس", "بايسبس"],
  },
  {
    name: "Hammer Curl",
    arabicName: "ثني الذراع هامر بالدمبل",
    muscle: "Arms",
    equipment: "Dumbbells",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "bicep_curl",
    formCue: "Keep neutral palms facing inward and control the eccentric all the way down.",
    aliases: ["preacher curl", "incline dumbbell curl"],
    arabicAliases: ["هامر كيرل", "شاكوش بايسبس", "تبادل شاكوش دمبل"],
  },
  {
    name: "Seated Cable Row",
    arabicName: "سحب أرضي جالس للظهر",
    muscle: "Back",
    equipment: "Cable Machine",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "horizontal_row",
    formCue: "Sit tall, drive elbows past torso, squeeze mid-back, and let scapulae protract cleanly.",
    aliases: ["cable row", "machine row"],
    arabicAliases: ["سحب أرضي", "سحب جالس بالكيبل", "طرنبة ظهر"],
  },
  {
    name: "Bent-Over Barbell Row",
    arabicName: "سحب البار منحني للظهر",
    muscle: "Back",
    equipment: "Barbell",
    sets: 4,
    reps: "8-10",
    restSeconds: 90,
    animationKey: "horizontal_row",
    formCue: "Hold a stable hip hinge and row the bar toward your lower sternum.",
    aliases: ["barbell row", "barbell bent-over row", "one-arm dumbbell row", "dumbbell row", "t-bar row"],
    arabicAliases: ["تجديف بالبار", "طرنبة بار", "سحب ظهر بالبار"],
  },
  {
    name: "Tricep Rope Pushdown",
    arabicName: "دفع الحبل لأسفل للترايسبس",
    muscle: "Arms",
    equipment: "Cable Machine",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "tricep_pushdown",
    formCue: "Keep elbows tucked at your sides and spread the rope gently at full extension.",
    aliases: ["tricep pushdown", "cable tricep pushdown", "skull crushers", "dips"],
    arabicAliases: ["تراي بالحبل", "مسطرة ترايسبس", "دفع حبل تراي"],
  },
  {
    name: "Walking Lunges",
    arabicName: "طعن المشي للأرجل",
    muscle: "Legs",
    equipment: "Dumbbells",
    sets: 3,
    reps: "10-12",
    restSeconds: 75,
    animationKey: "lunge",
    formCue: "Step long enough for a 90-degree front knee angle and push up through front heel.",
    aliases: ["lunges", "walking dumbbell lunge", "bulgarian split squat", "reverse lunges", "split squat"],
    arabicAliases: ["لانجز", "طعن بالدمبل", "خطوات طعن"],
  },
  {
    name: "Barbell Hip Thrust",
    arabicName: "دفع الحوض بالبار",
    muscle: "Legs",
    equipment: "Barbell",
    sets: 3,
    reps: "8-12",
    restSeconds: 90,
    animationKey: "hip_thrust",
    formCue: "Keep chin tucked, shins vertical at lockout, and pause 1 second at full glute squeeze.",
    aliases: ["hip thrust", "glute bridge"],
    arabicAliases: ["هيب ثراست", "رفع الحوض بالبار"],
  },
  {
    name: "Seated Leg Curl",
    arabicName: "ثني الأرجل الخلفي جالساً",
    muscle: "Legs",
    equipment: "Machine",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "squat",
    formCue: "Align knee joint with machine pivot and control the return phase.",
    arabicAliases: ["خلفي رجل جالس", "مرجحة رجل خلفي"],
  },
  {
    name: "Standing Calf Raise",
    arabicName: "رفع السمانة واقفاً",
    muscle: "Legs",
    equipment: "Machine",
    sets: 4,
    reps: "12-15",
    restSeconds: 45,
    animationKey: "squat",
    formCue: "Use a full stretch at the bottom and pause cleanly on the balls of your feet.",
    arabicAliases: ["سمانة واقف", "بطة الرجل"],
  },
  {
    name: "Face Pull",
    arabicName: "سحب الحبل للوجه (كتف خلفي)",
    muscle: "Shoulders",
    equipment: "Cable Machine",
    sets: 3,
    reps: "12-15",
    restSeconds: 60,
    animationKey: "horizontal_row",
    formCue: "Pull rope toward forehead while externally rotating thumbs behind ears.",
    arabicAliases: ["فيس بول", "كتف خلفي بالحبل", "سحب للوجه"],
  },
  {
    name: "Overhead Tricep Extension",
    arabicName: "مد الذراع خلف الرأس للترايسبس",
    muscle: "Arms",
    equipment: "Cable / Dumbbell",
    sets: 3,
    reps: "10-12",
    restSeconds: 60,
    animationKey: "tricep_pushdown",
    formCue: "Keep ribs down and stretch triceps fully behind head before extending.",
    arabicAliases: ["فرنساوي ترايسبس", "تراي خلف الرأس"],
  },
  {
    name: "Plank",
    arabicName: "تمرين الثبات (بلانك)",
    muscle: "Core",
    equipment: "Bodyweight",
    sets: 3,
    reps: "45s",
    restSeconds: 45,
    animationKey: "core_plank",
    formCue: "Stack elbows under shoulders, tuck pelvis slightly, and breathe steadily behind brace.",
    aliases: ["front plank", "side plank"],
    arabicAliases: ["بلانك", "ثبات البطن"],
  },
  {
    name: "Hanging Leg Raise",
    arabicName: "رفع الأرجل معلقاً للبطن",
    muscle: "Core",
    equipment: "Pull-Up Bar",
    sets: 3,
    reps: "10-15",
    restSeconds: 60,
    animationKey: "core_plank",
    formCue: "Curl pelvis upward with control rather than swinging legs with momentum.",
    aliases: ["leg raise", "hanging leg raises", "cable crunch", "ab wheel rollout"],
    arabicAliases: ["بطن عقلة", "رفع الأرجل للبطن"],
  },
];

export const ARABIC_EXERCISE_DICTIONARY: Record<string, string> = {
  ...Object.fromEntries(GYMOS_EXERCISE_LIBRARY.map((item) => [item.name, item.arabicName])),
  // Common gym & seeded routine variants (preserving exact English keys while showing natural Egyptian gym Arabic)
  "Bench Press": "ضغط الصدر بالبار",
  "Flat Barbell Bench Press": "ضغط الصدر المستوي بالبار",
  "Dumbbell Bench Press": "ضغط الصدر بالدمبل",
  "Incline Bench Press": "ضغط الصدر العالي بالبار",
  "Incline Dumbbell Bench Press": "ضغط الصدر العالي بالدمبل",
  "Dumbbell Chest Fly": "تفتيح الصدر بالدمبل",
  "Chest Fly": "تفتيح الصدر",
  "Pec Deck": "تفتيح الصدر على الجهاز",
  "Cable Crossover": "تقاطع الكيبل للصدر",
  "Push-Up": "تمرين الضغط",
  "Squat": "القرفصاء",
  "Back Squat": "القرفصاء بالبار",
  "Front Squat": "القرفصاء الأمامي بالبار",
  "Leg Extension": "مد الأرجل الأمامي على الجهاز",
  "Lying Leg Curl": "ثني الأرجل الخلفي نائماً",
  "Conventional Deadlift": "الرفعة المميتة التقليدية",
  "Sumo Deadlift": "الرفعة المميتة سومو",
  "Pull-Up": "العقلة",
  "Weighted Pull-Ups": "العقلة بوزن إضافي",
  "Chin-Ups": "العقلة بقبضة معكوسة",
  "Barbell Bent-Over Row": "سحب البار منحني للظهر",
  "Single-Arm Dumbbell Row": "سحب الدمبل بيد واحدة للظهر",
  "One-Arm Dumbbell Row": "سحب الدمبل بيد واحدة للظهر",
  "T-Bar Row": "سحب تي بار للظهر",
  "Barbell Overhead Press": "ضغط الأكتاف بالبار واقفاً",
  "Shoulder Press": "ضغط الأكتاف",
  "Dumbbell Shoulder Press": "ضغط الأكتاف بالدمبل",
  "Arnold Press": "ضغط أرنولد للأكتاف بالدمبل",
  "Lateral Raise": "رفرفة جانبية للأكتاف",
  "Seated Lateral Raises": "رفرفة جانبية للأكتاف جالساً",
  "Cable Lateral Raise": "رفرفة جانبية بالكيبل",
  "Bicep Curl": "ثني الذراع للبايسبس",
  "Biceps Curl": "ثني الذراع للبايسبس",
  "Dumbbell Bicep Curl": "تبادل ثني الذراع للبايسبس بالدمبل",
  "Barbell EZ-Bar Curl": "ثني الذراع للبايسبس بالبار المتعرج",
  "EZ-Bar Curl": "ثني الذراع للبايسبس بالبار المتعرج",
  "Preacher Curl": "ثني البايسبس على مسند الحصان",
  "Cable Tricep Pushdown": "دفع الكيبل لأسفل للترايسبس",
  "Tricep Pushdown": "دفع الكيبل لأسفل للترايسبس",
  "Skull Crushers": "ترايسبس بالبار نائماً",
  "Dips": "المتوازي",
  "Walking Dumbbell Lunge": "طعن المشي بالدمبل",
  "Bulgarian Split Squat": "القرفصاء البلغاري",
  "Hip Thrust": "دفع الحوض",
  "Glute Bridge": "رفع الحوض الأرضي",
  "Hanging Leg Raises": "رفع الأرجل معلقاً للبطن",
  "Kettlebell Swings": "أرجحة الكيتل بل",
  "Plank Shoulder Taps": "بلانك مع لمس الأكتاف",
  "Cable Crunch": "طحن البطن بالكيبل",
};

const ARABIC_MUSCLE_TERMS: Record<string, string[]> = {
  Chest: ["صدر", "الصدر", "بنش"],
  Back: ["ظهر", "الظهر", "مجنص", "قطنية"],
  Legs: ["أرجل", "رجل", "الأرجل", "فخذ", "خلفيات", "سمانة", "قرفصاء", "سكوات"],
  Shoulders: ["أكتاف", "كتف", "الأكتاف"],
  Arms: ["ذراع", "الذراعين", "بايسبس", "باي", "ترايسبس", "تراي"],
  Core: ["بطن", "البطن", "جذع", "بلانك"],
  "Full body": ["شامل", "كامل الجسم"],
};

const ARABIC_EXERCISE_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [en, ar] of Object.entries(ARABIC_EXERCISE_DICTIONARY)) {
    map.set(en.trim().toLowerCase().replace(/\s+/g, " "), ar);
  }
  return map;
})();

export function getArabicExerciseName(exerciseName: string): string | null {
  const key = (exerciseName || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return ARABIC_EXERCISE_LOOKUP.get(key) ?? null;
}

export function matchesExerciseQuery(
  item: {
    name: string;
    muscle?: string;
    equipment?: string;
    arabicName?: string;
    aliases?: string[];
    arabicAliases?: string[];
  },
  rawQuery: string,
): boolean {
  const q = (rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.muscle && item.muscle.toLowerCase().includes(q)) return true;
  if (item.equipment && item.equipment.toLowerCase().includes(q)) return true;
  const arName = item.arabicName ?? getArabicExerciseName(item.name);
  if (arName && arName.toLowerCase().includes(q)) return true;
  if (item.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
  if (item.arabicAliases?.some((a) => a.toLowerCase().includes(q))) return true;
  const builtin = BUILTIN_LOOKUP.get(normalizeExerciseKey(item.name));
  if (builtin) {
    if (builtin.arabicName.toLowerCase().includes(q)) return true;
    if (builtin.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    if (builtin.arabicAliases?.some((a) => a.toLowerCase().includes(q))) return true;
  }
  const muscleTerms = item.muscle ? ARABIC_MUSCLE_TERMS[item.muscle] : undefined;
  if (muscleTerms?.some((term) => term.includes(q))) return true;
  return false;
}

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
