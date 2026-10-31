"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Globe } from "lucide-react";

export type MobileLanguage = "en" | "ar";

const STORAGE_KEY = "gymos_mobile_language";

const EXACT_AR: Record<string, string> = {
  // Brand & Top Bars
  "GymOS Mobile": "تطبيق GymOS",
  "GymOS mobile authentication": "تسجيل الدخول إلى تطبيق GymOS",
  "GymOS member app": "تطبيق أعضاء GymOS",
  "GymOS member onboarding": "تسجيل اشتراك عضو جديد في GymOS",
  "GymOS trainer app": "تطبيق مدربي GymOS",
  "Loading GymOS mobile app": "جارٍ تحميل تطبيق GymOS",
  "Loading your GymOS pass…": "جارٍ تحميل بطاقتك الرقمية…",
  "MEMBERS & TRAINERS": "الأعضاء والمدربون",
  "MEMBER APP": "تطبيق الأعضاء",
  "Member App": "تطبيق الأعضاء",
  "Coach": "مدرب",
  "Active Coach": "مدرب نشط",
  "Active Trainer": "مدرب نشط",
  "Coach account": "حساب مدرب",
  "Coach workspace": "مساحة عمل المدرب",
  "Sign out": "تسجيل الخروج",
  "Signing out…": "جارٍ تسجيل الخروج…",

  // Auth Screen
  "Welcome back": "مرحباً بعودتك",
  "Sign in as a gym member or coach to scan in and view your schedule.":
    "سجّل الدخول كعضو أو مدرب لمسح رمز الحضور ومتابعة جدولك وبرامجك.",
  "Quick member signup": "إنشاء حساب عضو سريع",
  "Create your account in seconds — or enter the phone registered at reception to link your plan.":
    "أنشئ حسابك في ثوانٍ — أو أدخل رقم الهاتف المسجل في الاستقبال لربط باقتك تلقائياً.",
  "Register as a trainer": "التسجيل كمدرب معتمد",
  "Enter the one-time invite code provided by your gym administrator.":
    "أدخل رمز الدعوة لمرة واحدة الصادر لك من إدارة النادي.",
  "Account role": "نوع الحساب",
  "Member": "عضو",
  "Trainer": "مدرب",
  "Trainee": "متدرب",
  "Full name": "الاسم الكامل",
  "Your full name": "اسمك الكامل",
  "Phone or email": "رقم الهاتف أو البريد الإلكتروني",
  "Phone number or email": "رقم الهاتف أو البريد الإلكتروني",
  "Phone number": "رقم الهاتف",
  "Email": "البريد الإلكتروني",
  "+ Add email address (optional)": "+ إضافة بريد إلكتروني (اختياري)",
  "Hide optional email": "إخفاء البريد الإلكتروني الاختياري",
  "Enter a specific gym code (optional)": "إدخال كود نادٍ محدد (اختياري)",
  "Hide gym code": "إخفاء كود النادي",
  "Gym code": "كود النادي",
  "e.g. gymos-elite-new-cairo": "مثال: gymos-elite-new-cairo",
  "Admin trainer invite code": "رمز دعوة المدرب من الإدارة",
  "Coaching specialty": "التخصص التدريبي",
  "Personal Training & Fitness": "التدريب الشخصي واللياقة البدنية",
  "e.g. Strength & Conditioning": "مثال: القوة والتكيّف البدني",
  "Password": "كلمة المرور",
  "Your password": "كلمة المرور",
  "At least 6 characters": "6 أحرف على الأقل",
  "Sign in": "تسجيل الدخول",
  "Create Member Account": "إنشاء حساب العضو",
  "Verify Code & Register as Trainer": "التحقق من الرمز والتسجيل كمدرب",
  "Please wait…": "يرجى الانتظار…",
  "Verifying…": "جارٍ التحقق…",
  "New to the app?": "جديد في التطبيق؟",
  "Create an account": "إنشاء حساب جديد",
  "Already have an account?": "لديك حساب بالفعل؟",
  "Back to sign in": "العودة لتسجيل الدخول",
  "Unable to authenticate.": "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.",
  "Invalid phone/email or password.": "رقم الهاتف/البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "Invalid or already-used trainer invite code.": "رمز دعوة المدرب غير صالح أو تم استخدامه مسبقاً.",
  "Unable to verify invite code.": "تعذر التحقق من رمز الدعوة.",
  "Unable to verify invite code right now.": "تعذر التحقق من رمز الدعوة حالياً.",
  "Signed in, but your profile session could not be loaded. Please try again.":
    "تم تسجيل الدخول، لكن تعذر تحميل جلستك. يرجى المحاولة مرة أخرى.",

  // Bottom Navigation Tabs
  "Member app navigation": "تنقل تطبيق العضو",
  "Trainer app navigation": "تنقل تطبيق المدرب",
  "Pass": "البطاقة",
  "Member pass": "بطاقة العضوية",
  "Workout": "التمارين",
  "Profile": "حسابي",
  "Clients": "المتدربون",
  "Schedule": "الجدول",
  "Weekly Shifts": "المناوبات",

  // Common Statuses & Actions
  "Active": "نشط",
  "Unpaid": "غير مدفوع",
  "Expired": "منتهي",
  "Pending": "معلق",
  "Unknown": "غير محدد",
  "None": "لا يوجد",
  "NoPlan": "بدون باقة",
  "(optional)": "(اختياري)",
  "Cash": "نقدي (كاش)",
  "Card": "بطاقة بنكية",
  "Instapay": "إنستاباي (InstaPay)",
  "EGP": "ج.م",
  "Cancel": "إلغاء",
  "Cancelling…": "جارٍ الإلغاء…",
  "Close": "إغلاق",
  "Done": "تم",
  "Reset": "إعادة ضبط",
  "View": "عرض",
  "View all": "عرض الكل",
  "Retry connection": "إعادة الاتصال",
  "Connection interrupted": "انقطع الاتصال بالخادم",
  "Saving…": "جارٍ الحفظ…",
  "Unable to save changes.": "تعذر حفظ التغييرات.",
  "Unable to load your profile.": "تعذر تحميل ملفك الشخصي.",
  "Unable to load your member profile.": "تعذر تحميل ملف العضوية الخاص بك.",
  "Unable to load your trainer profile.": "تعذر تحميل ملف المدرب الخاص بك.",
  "Today": "اليوم",
  "Yesterday": "أمس",
  "Sun": "الأحد",
  "Mon": "الإثنين",
  "Tue": "الثلاثاء",
  "Wed": "الأربعاء",
  "Thu": "الخميس",
  "Fri": "الجمعة",
  "Sat": "السبت",

  // Member Onboarding & QR Subscription Flow
  "Account ready": "الحساب جاهز",
  "You're not enrolled in a gym plan yet. Scan the Reception QR code at the gym to view plans, choose how to pay, and activate your pass.":
    "أنت غير مشترك في باقة نادٍ بعد. امسح رمز QR الموجود في مكتب الاستقبال لعرض الباقات واختيار طريقة الدفع وتفعيل بطاقتك.",
  "Connect to your gym": "الارتباط بالنادي",
  "Connect to Gym": "الاتصال بالنادي",
  "Connect": "اتصال",
  "Scan Gym QR Code": "مسح رمز QR للنادي",
  "Scan gym QR code": "مسح رمز QR للنادي",
  "Scan gym QR code to view plans": "امسح رمز QR للنادي لعرض الباقات",
  "Scan Reception QR": "مسح رمز QR بالاستقبال",
  "Enter reception gym code…": "أدخل كود النادي من الاستقبال…",
  "Connected via QR": "متصل عبر رمز QR",
  "Verified Gym": "نادٍ معتمد",
  "Rescan": "إعادة المسح",
  "1. Choose your membership plan": "1. اختر باقة الاشتراك",
  "2. Choose how you will pay": "2. اختر طريقة الدفع",
  "Best value": "الأفضل قيمة",
  "Selected plan": "الباقة المختارة",
  "Pay cash at the reception desk": "الدفع نقداً في مكتب الاستقبال",
  "Pay by card terminal at reception": "الدفع بالبطاقة عبر ماكينة الاستقبال",
  "Instant transfer & show front desk": "تحويل فوري وعرض الإشعار للاستقبال",
  "Amount to pay": "المبلغ المطلوب سداده",
  "Sending to gym staff…": "جارٍ الإرسال لموظفي الاستقبال…",
  "Sent to gym reception": "تم الإرسال إلى استقبال النادي",
  "Waiting for staff approval": "بانتظار تفعيل موظف الاستقبال",
  "Checking live… This screen updates automatically the moment gym staff accepts your payment.":
    "جارٍ التحديث تلقائياً… ستتفعل بطاقتك فور تأكيد موظف الاستقبال لدفعتك.",
  "Refresh status": "تحديث الحالة",
  "Checking…": "جارٍ التحقق…",
  "Change plan": "تغيير الباقة",
  "Complete your": "أكمل عملية دفع",
  "payment with reception at": "مع مكتب الاستقبال في",
  ". Once staff clicks": ". بمجرد ضغط الموظف على",
  "Accept": "قبول وتفعيل",
  ", your gym pass unlocks automatically.": "، ستُفتح بطاقة دخولك للنادي تلقائياً.",
  "· Gym staff will get an instant notification to accept your":
    "· سيتلقى موظف الاستقبال إشعاراً فورياً لتأكيد دفعتك عبر",
  "payment.": ".",
  "This gym has not published any active membership plans yet.":
    "لم يقم هذا النادي بنشر أي باقات اشتراك نشطة حتى الآن.",
  "Scan a valid GymOS reception QR code first.": "يرجى مسح رمز QR صالح للاستقبال أولاً.",
  "Could not connect to gym QR code.": "تعذر الاتصال برمز QR الخاص بالنادي.",
  "Unable to send your subscription request.": "تعذر إرسال طلب الاشتراك.",
  "Unable to cancel request.": "تعذر إلغاء الطلب.",

  // QR Scanner Modal & Check-in Feedback
  "GymOS Check-in": "تسجيل حضور GymOS",
  "Close scanner": "إغلاق الماسح",
  "Starting camera…": "جارٍ تشغيل الكاميرا…",
  "Ready to scan": "جاهز للمسح",
  "Camera live · Point at Reception QR": "الكاميرا نشطة · وجّهها نحو رمز QR بالاستقبال",
  "Camera access is not available in this browser view.":
    "الوصول إلى الكاميرا غير متاح في هذا المتصفح.",
  "No camera was detected on this device.": "لم يتم العثور على كاميرا في هذا الجهاز.",
  "Camera access is unavailable. Allow camera permissions or enter the gym code from reception below.":
    "تعذر الوصول للكاميرا. اسمح بصلاحية الكاميرا أو أدخل كود النادي من الاستقبال أدناه.",
  "Invalid QR code. Scan the QR code displayed at your gym's reception desk.":
    "رمز QR غير صالح. يرجى مسح رمز QR المعروض في مكتب استقبال ناديك.",
  "Check in": "تسجيل حضور",
  "Checked in": "تم تسجيل الحضور",
  "Check-in confirmed": "تم تأكيد حضورك بنجاح",
  "Check-in could not be completed.": "تعذر إتمام تسجيل الحضور.",
  "You're checked in,": "تم تسجيل حضورك بنجاح،",
  "Coach floor check-in · Verified": "تسجيل حضور المدرب بالصالة · مؤكد",

  // Member Portal Pass, Workout & Profile Views
  "Digital member pass": "بطاقة العضوية الرقمية",
  "Digital trainer pass": "بطاقة المدرب الرقمية",
  "MEMBERSHIP PLAN": "باقة الاشتراك",
  "SUBSCRIPTION": "الاشتراك",
  "MEMBER ID": "رقم العضوية",
  "COACH ID": "رقم المدرب",
  "VALID THROUGH": "صالح حتى",
  "No active plan": "لا توجد باقة نشطة",
  "Payment needs attention": "توجد دفعة مستحقة تحتاج للمتابعة",
  "Contact the front desk to settle your balance before check-in.":
    "يرجى مراجعة مكتب الاستقبال لتسوية الرصيد المستحق قبل تسجيل الدخول.",
  "Visit the front desk to activate a membership plan.":
    "تفضل بزيارة مكتب الاستقبال لتفعيل باقة اشتراك.",
  "Upcoming coaching session": "الجلسة التدريبية القادمة",
  "People training with you": "فريق التدريب المرافق لك",
  "Assigned trainer": "المدرب المخصص",
  "No trainer assigned": "لم يتم تعيين مدرب بعد",
  "Assigned workout routine": "البرنامج التدريبي المخصص",
  "No workout assigned": "لا يوجد برنامج تدريبي مخصص",
  "No workout plan assigned yet": "لم يتم تعيين برنامج تدريبي بعد",
  "No assigned workout plan yet": "لا يوجد برنامج تدريبي مخصص لك حتى الآن",
  "Ask your gym trainer to assign a workout plan.":
    "اطلب من مدربك في النادي تعيين برنامج تدريبي لحسابك.",
  "Today's workout": "تمرين اليوم",
  "Today's assigned routine": "البرنامج التدريبي المخصص لليوم",
  "Workout progress": "تقدم التمرين",
  "sets complete": "مجموعات مكتملة",
  "Set": "مجموعة",
  "Set progress is saved on this device for": "يتم حفظ تقدم المجموعات على هذا الجهاز لحساب",
  "your account": "حسابك",
  "Profile & membership": "الملف الشخصي والعضوية",
  "Profile & check-ins": "الملف الشخصي وسجل الحضور",
  "Your account": "بيانات حسابك",
  "Membership and payment status": "حالة العضوية والدفع",
  "Current plan:": "الباقة الحالية:",
  "Latest payment status:": "آخر حالة دفع:",
  "Membership": "العضوية",
  "Payment method": "طريقة الدفع",
  "Gym": "النادي",
  "Gym floor": "صالة التدريب",
  "Gym floor · QR self-scan": "صالة التدريب · مسح QR ذاتي",
  "Gym floor · Front desk": "صالة التدريب · مكتب الاستقبال",
  "Member self-scan": "مسح ذاتي (عضو)",
  "Trainer self-scan": "مسح ذاتي (مدرب)",
  "Your activity": "نشاطك",
  "Attendance history": "سجل الحضور",
  "Your recent visits to the club": "زياراتك الأخيرة للنادي",
  "Visits": "الزيارات",
  "recent": "الأخيرة",
  "No visits recorded yet. Scan the reception QR code when you arrive!":
    "لا توجد زيارات مسجلة بعد. امسح رمز QR بالاستقبال عند وصولك للنادي!",
  ". Please check with the front desk.": ". يرجى مراجعة مكتب الاستقبال.",

  // Trainer Portal Views
  "FLOOR STATUS": "حالة الصالة الآن",
  "In gym now": "في النادي الآن",
  "On Floor": "متواجد بالصالة",
  "Clients in the gym right now": "المتدربون المتواجدون في الصالة الآن",
  "None of your trainees are checked in right now":
    "لا يوجد أي من متدربيك داخل الصالة في الوقت الحالي",
  "Next coaching session": "الجلسة التدريبية القادمة",
  "No upcoming sessions — tap to schedule": "لا توجد جلسات قادمة — اضغط لجدولة جلسة",
  "Your roster": "قائمة متدربيك",
  "ASSIGNED CLIENTS": "المتدربون المعينون",
  "No trainees assigned to you yet. Gym staff can assign members on the Trainers page.":
    "لم يتم تعيين متدربين لك بعد. يمكن لإدارة النادي تعيين الأعضاء من صفحة المدربين.",
  "No trainees match this filter.": "لا يوجد متدربون يطابقون هذه التصفية.",
  "Select a workout template…": "اختر قالباً تدريبياً…",
  "Book": "حجز جلسة",
  "New session": "جلسة جديدة",
  "Your schedule": "جدولك التدريبي",
  "Coach Schedule": "جدول المدرب",
  "Coaching calendar": "تقويم الجلسات التدريبية",
  "Scheduled 1-on-1 Sessions": "جلسات التدريب الفردي المجدولة",
  "1-on-1 Personal Training": "تدريب شخصي فردي",
  "Schedule training session": "جدولة جلسة تدريبية",
  "Session focus": "موضوع / تركيز الجلسة",
  "e.g. Heavy squat progression": "مثال: تطوير أوزان تمرين السكوات",
  "Date & time": "التاريخ والوقت",
  "Duration": "المدة",
  "Duration:": "المدة:",
  "30 min": "30 دقيقة",
  "45 min": "45 دقيقة",
  "60 min": "60 دقيقة",
  "90 min": "90 دقيقة",
  "min": "دقيقة",
  "Notes": "ملاحظات",
  "Confirm session": "تأكيد الجلسة",
  "Mark completed": "تحديد كمكتملة",
  "No sessions scheduled yet.": "لا توجد جلسات مجدولة حتى الآن.",
  "Tap “New session” above to book a client.": "اضغط على «جلسة جديدة» أعلاه لحجز موعد مع متدرب.",
  "Sessions will appear here once clients are assigned.":
    "ستظهر الجلسات هنا بمجرد تعيين متدربين لك.",
  "Set your weekly gym floor hours so front-desk staff and trainees know your coaching availability.":
    "حدد ساعات تواجدك الأسبوعية في الصالة ليعرف موظفو الاستقبال والمتدربون مواعيدك المتاحة.",
  "Day off": "يوم راحة",
  "Save weekly shifts": "حفظ المناوبات الأسبوعية",
  "Saving shifts…": "جارٍ حفظ المناوبات…",
  "Shifts saved!": "تم حفظ المناوبات بنجاح!",
  "No floor check-ins yet. Scan the Reception QR code when you arrive!":
    "لا يوجد حضور مسجل بالصالة بعد. امسح رمز QR بالاستقبال عند وصولك!",

  // Seeded Plans & Hosted API Messages
  "1 Month Regular": "اشتراك شهر واحد عادي",
  "3 Months Saver": "اشتراك 3 أشهر توفير",
  "3 Month Saver": "اشتراك 3 أشهر توفير",
  "6 Months Pro": "اشتراك 6 أشهر احترافي",
  "6 Month Flex": "اشتراك 6 أشهر مرن",
  "12 Months VIP": "اشتراك سنوي VIP",
  "Annual VIP": "اشتراك سنوي VIP",
  "Your session has expired. Please sign in again.":
    "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.",
  "The GymOS server is waking up or temporarily unavailable. Please wait a few seconds and try again.":
    "خادم GymOS قيد التشغيل أو غير متاح مؤقتاً. يرجى الانتظار ثوانٍ قليلة والمحاولة مرة أخرى.",
  "Enter a valid phone number.": "يرجى إدخال رقم هاتف صالح.",

  // Split JSX Text Fragments
  "Next:": "التالي:",
  "Payment status ·": "حالة الدفع ·",
  "Phone:": "الهاتف:",
  "Recent gym check-ins (": "سجل الحضور الأخير (",
  "Schedule session with": "جدولة جلسة مع",
  "Sessions (": "الجلسات (",
  "Upcoming session with": "جلسة قادمة مع",
  "Verified code ·": "رمز معتمد ·",
  "reps ·": "تكرار ·",
  "rest": "راحة",
  "sets ·": "مجموعات ·",

  // Workout routine verification & duration labels
  "1 month": "شهر واحد",
  "2 months": "شهران",
  "3 months": "3 أشهر",
  "6 months": "6 أشهر",
  "9 months": "9 أشهر",
  "12 months": "12 شهراً",
  "24 months": "24 شهراً",
  "VIP Annual": "الباقة السنوية (VIP)",
  "Workout routine verification": "تأكيد البرنامج التدريبي",
  "Do you want to accept this workout routine change?":
    "هل تريد قبول تغيير البرنامج التدريبي هذا؟",
  "Accept Routine": "قبول البرنامج",
  "Decline": "رفض",
  "Dismiss": "إخفاء",
  "Workout routine change declined.": "تم رفض تغيير البرنامج التدريبي.",
  "Unable to update workout routine.": "تعذر تحديث البرنامج التدريبي.",
};

const EN_MONTHS: Record<string, string> = {
  January: "يناير",
  February: "فبراير",
  March: "مارس",
  April: "أبريل",
  May: "مايو",
  June: "يونيو",
  July: "يوليو",
  August: "أغسطس",
  September: "سبتمبر",
  October: "أكتوبر",
  November: "نوفمبر",
  December: "ديسمبر",
  Jan: "يناير",
  Feb: "فبراير",
  Mar: "مارس",
  Apr: "أبريل",
  Jun: "يونيو",
  Jul: "يوليو",
  Aug: "أغسطس",
  Sep: "سبتمبر",
  Oct: "أكتوبر",
  Nov: "نوفمبر",
  Dec: "ديسمبر",
};

const EN_WEEKDAYS: Record<string, string> = {
  Sunday: "الأحد",
  Monday: "الإثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
  Saturday: "السبت",
  Sun: "الأحد",
  Mon: "الإثنين",
  Tue: "الثلاثاء",
  Wed: "الأربعاء",
  Thu: "الخميس",
  Fri: "الجمعة",
  Sat: "السبت",
};

function translateStatusWord(word: string): string {
  const lower = word.trim().toLowerCase();
  if (lower === "active") return "نشط";
  if (lower === "expiring") return "قارب على الانتهاء";
  if (lower === "expired") return "منتهي";
  if (lower === "inactive") return "غير نشط";
  if (lower === "pending") return "معلق";
  if (lower === "paid") return "مدفوع";
  if (lower === "unpaid") return "غير مدفوع";
  if (lower === "overdue") return "متأخر";
  if (lower === "cash") return "نقدي";
  if (lower === "card") return "بطاقة بنكية";
  if (lower === "instapay") return "إنستاباي";
  return EXACT_AR[word] ?? word;
}

function translateDatesAndCurrency(input: string): string {
  let out = input;
  out = out.replace(/EGP[\s\u00A0]*([0-9][0-9,.]*)/g, "$1 ج.م");
  out = out.replace(/([0-9][0-9,.]*)[\s\u00A0]*EGP\b/g, "$1 ج.م");

  out = out.replace(
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/g,
    (_, wd: string, mo: string, d: string, yr?: string) =>
      yr
        ? `${EN_WEEKDAYS[wd] ?? wd}، ${d} ${EN_MONTHS[mo] ?? mo} ${yr}`
        : `${EN_WEEKDAYS[wd] ?? wd}، ${d} ${EN_MONTHS[mo] ?? mo}`,
  );

  out = out.replace(
    /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/g,
    (_, wd: string, mo: string, d: string) =>
      `${EN_WEEKDAYS[wd] ?? wd}، ${d} ${EN_MONTHS[mo] ?? mo}`,
  );

  out = out.replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/g,
    (_, mo: string, d: string, yr?: string) =>
      yr ? `${d} ${EN_MONTHS[mo] ?? mo} ${yr}` : `${d} ${EN_MONTHS[mo] ?? mo}`,
  );

  out = out.replace(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/g,
    (_, d: string, mo: string, yr: string) => `${d} ${EN_MONTHS[mo] ?? mo} ${yr}`,
  );

  out = out.replace(/\b(\d{1,2}:\d{2})\s*AM\b/gi, "$1 ص");
  out = out.replace(/\b(\d{1,2}:\d{2})\s*PM\b/gi, "$1 م");
  return out;
}

const AR_PATTERNS: Array<[RegExp, (...args: string[]) => string]> = [
  [/^All\s*\((\d+)\)$/i, (_, n) => `الكل (${n})`],
  [/^In Gym\s*\((\d+)\)$/i, (_, n) => `في النادي (${n})`],
  [/^Needs Plan\s*\((\d+)\)$/i, (_, n) => `بدون برنامج (${n})`],
  [/^Sessions\s*\((\d+)\)$/i, (_, n) => `الجلسات (${n})`],
  [/^Recent gym check-ins\s*\((\d+)\)$/i, (_, n) => `سجل الحضور الأخير (${n})`],
  [
    /^(\d+)\s+of your trainees checked in on floor$/i,
    (_, n) => `${n} من متدربيك متواجدون حالياً في الصالة`,
  ],
  [
    /^Membership status\s*·\s*(.+)$/i,
    (_, st) => `حالة العضوية · ${translateStatusWord(st)}`,
  ],
  [
    /^Payment status\s*·\s*(.+)$/i,
    (_, st) => `حالة الدفع · ${translateStatusWord(st)}`,
  ],
  [
    /^Valid through\s+(.+)$/i,
    (_, d) => `صالح حتى ${translateDatesAndCurrency(d)}`,
  ],
  [
    /^Valid\s+(.+)\s+to\s+(.+)\.$/i,
    (_, a, b) => `صالح من ${translateDatesAndCurrency(a)} إلى ${translateDatesAndCurrency(b)}.`,
  ],
  [
    /^Confirm\s+(.+)\s+·\s+(.+)\s+\((.+)\)$/i,
    (_, plan, price, method) =>
      `تأكيد ${EXACT_AR[plan] ?? plan} · ${translateDatesAndCurrency(price)} (${translateStatusWord(method)})`,
  ],
  [/^Schedule session with\s+(.+)$/i, (_, name) => `جدولة جلسة مع ${name}`],
  [/^Upcoming session with\s+(.+)$/i, (_, name) => `جلسة قادمة مع ${name}`],
  [/^Coach\s+(.+)\s+·\s+(.+)$/i, (_, name, spec) => `المدرب ${name} · ${EXACT_AR[spec] ?? spec}`],
  [/^Verified code\s*·\s*(.+)$/i, (_, info) => `رمز معتمد · ${info}`],
  [/^Phone:\s*(.+)$/i, (_, ph) => `الهاتف: ${ph}`],
  [/^Next:\s*(.+)$/i, (_, nx) => `التالي: ${translateDatesAndCurrency(nx)}`],
  [
    /^(.+)\s+·\s+(\d+)\s+exercises?$/i,
    (_, title, n) => `${title} · ${n} تمارين`,
  ],
  [/^(.+)\s+\((\d+)\s+ex\)$/i, (_, title, n) => `${title} (${n} تمارين)`],
  [/^(.+)\s+sets$/i, (_, ex) => `مجموعات ${ex}`],
  [
    /^(\d+)\s+months?$/i,
    (_, n) => (n === "1" ? "شهر واحد" : n === "2" ? "شهران" : Number(n) <= 10 ? `${n} أشهر` : `${n} شهراً`),
  ],
  [
    /^(\d+)\s+sets?\s*·\s*([0-9–-]+)\s+reps?\s*·\s*(.+)\s+rest$/i,
    (_, s, r, rest) => `${s} مجموعات · ${r} تكرار · راحة ${rest}`,
  ],
  [/^([0-9–-]+)\s+reps?\s*·\s*(.+)\s+rest$/i, (_, r, rest) => `${r} تكرار · راحة ${rest}`],
  [/^Sent by\s+(.+)$/i, (_, by) => `مُرسل بواسطة ${by}`],
  [/^Workout routine updated to\s+(.+)\.$/i, (_, title) => `تم تحديث البرنامج التدريبي إلى ${title}.`],
  [/^\+(\d+)\s+more exercises$/i, (_, n) => `+${n} تمارين إضافية`],
  [
    /^·\s*(.+)\s+\((\d+)\s+exercises?\)$/i,
    (_, goal, n) => `· ${EXACT_AR[goal] ?? goal} (${n} تمارين)`,
  ],
  [/^with\s+(.+)$/i, (_, name) => `مع ${name}`],
  [/^of$/i, () => "من"],
  [/^with$/i, () => "مع"],
];

function shouldSkipText(trimmed: string): boolean {
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return true;
  if (trimmed === "GymOS") return true;
  if (
    trimmed.includes("@") ||
    /^https?:\/\//i.test(trimmed) ||
    /^(STF-|TRN-|OWN-|GYMOS-GYM:)/i.test(trimmed) ||
    /\.(com|eg|local|app|org|net)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (/^[A-Z]{1,3}$/.test(trimmed) && !(trimmed in EXACT_AR)) {
    return true;
  }
  return false;
}

export function translateToArabic(raw: string): string {
  if (!raw) return raw;
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return raw;
  const [, leading, core, trailing] = match;
  if (!core) return raw;

  const normalizedCore = core.replace(/\s+/g, " ");
  if (normalizedCore in EXACT_AR) {
    return `${leading}${EXACT_AR[normalizedCore]}${trailing}`;
  }
  if (shouldSkipText(normalizedCore)) {
    return raw;
  }

  const statusCandidate = translateStatusWord(normalizedCore);
  if (statusCandidate !== normalizedCore) {
    return `${leading}${statusCandidate}${trailing}`;
  }

  for (const [pattern, replacer] of AR_PATTERNS) {
    const m = normalizedCore.match(pattern);
    if (m) {
      return `${leading}${replacer(...m)}${trailing}`;
    }
  }

  const withDatesAndCurrency = translateDatesAndCurrency(normalizedCore);
  if (withDatesAndCurrency !== normalizedCore) {
    return `${leading}${withDatesAndCurrency}${trailing}`;
  }

  return raw;
}

type LanguageContextValue = {
  lang: MobileLanguage;
  isRtl: boolean;
  setLang: (next: MobileLanguage) => void;
  toggleLang: () => void;
  t: (englishText: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  isRtl: false,
  setLang: () => undefined,
  toggleLang: () => undefined,
  t: (text) => text,
});

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "SVG",
  "TEXTAREA",
]);

function isInsideSkippedElement(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.dataset?.noTranslate === "true") return true;
    if (el.classList?.contains("font-mono")) return true;
    el = el.parentElement;
  }
  return false;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<MobileLanguage>("en");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem("gymos_language");
      if (saved === "ar" || saved === "en") {
        setLangState(saved);
      }
    } catch {
      // Ignore storage access errors in restricted webviews.
    }
    setHydrated(true);
  }, []);

  const setLang = useCallback((next: MobileLanguage) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.localStorage.setItem("gymos_language", next);
    } catch {
      // Ignore storage write errors.
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "en" ? "ar" : "en");
  }, [lang, setLang]);

  const t = useCallback(
    (englishText: string) => (lang === "ar" ? translateToArabic(englishText) : englishText),
    [lang],
  );

  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;

    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";

    const w = window as unknown as {
      __gymosMobileOrigText?: WeakMap<Text, string>;
      __gymosMobileLastArText?: WeakMap<Text, string>;
      __gymosMobileTrackedTexts?: Set<Text>;
    };
    if (!w.__gymosMobileOrigText) w.__gymosMobileOrigText = new WeakMap<Text, string>();
    if (!w.__gymosMobileLastArText) w.__gymosMobileLastArText = new WeakMap<Text, string>();
    if (!w.__gymosMobileTrackedTexts) w.__gymosMobileTrackedTexts = new Set<Text>();

    const origTextMap = w.__gymosMobileOrigText;
    const lastArMap = w.__gymosMobileLastArText;
    const trackedTexts = w.__gymosMobileTrackedTexts;

    let isApplying = false;

    const processTextNode = (textNode: Text) => {
      if (isInsideSkippedElement(textNode)) return;
      const current = textNode.nodeValue ?? "";

      if (lang === "ar") {
        const parentEl = textNode.parentElement;
        if (parentEl && parentEl.tagName === "OPTION" && !parentEl.hasAttribute("value")) {
          const origVal = (origTextMap.get(textNode) ?? current).trim();
          if (origVal) parentEl.setAttribute("value", origVal);
        }

        const prevAr = lastArMap.get(textNode);
        if (prevAr !== undefined && current === prevAr) {
          return;
        }
        const englishSource =
          origTextMap.get(textNode) !== undefined && current === prevAr
            ? origTextMap.get(textNode)!
            : current;
        origTextMap.set(textNode, englishSource);
        trackedTexts.add(textNode);

        const translated = translateToArabic(englishSource);
        if (translated !== current) {
          lastArMap.set(textNode, translated);
          textNode.nodeValue = translated;
        } else {
          lastArMap.set(textNode, current);
        }
      } else {
        const orig = origTextMap.get(textNode);
        if (orig !== undefined && current === lastArMap.get(textNode)) {
          textNode.nodeValue = orig;
        }
      }
    };

    const ATTR_NAMES = ["placeholder", "aria-label", "title"] as const;

    const processElementAttrs = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.noTranslate === "true") return;

      for (const attr of ATTR_NAMES) {
        const dataKey =
          attr === "placeholder"
            ? "i18nOrigPlaceholder"
            : attr === "aria-label"
              ? "i18nOrigAriaLabel"
              : "i18nOrigTitle";
        const lastArKey = `${dataKey}Ar`;
        const val = el.getAttribute(attr);
        if (val === null) continue;

        if (lang === "ar") {
          if (el.dataset[lastArKey] === val) continue;
          const orig =
            el.dataset[dataKey] && el.dataset[lastArKey] === val ? el.dataset[dataKey]! : val;
          el.dataset[dataKey] = orig;
          const tr = translateToArabic(orig);
          el.dataset[lastArKey] = tr;
          if (tr !== val) {
            el.setAttribute(attr, tr);
          }
        } else {
          const orig = el.dataset[dataKey];
          if (orig !== undefined && el.dataset[lastArKey] === val && orig !== val) {
            el.setAttribute(attr, orig);
          }
        }
      }
    };

    const walkSubtree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        processTextNode(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      processElementAttrs(root as Element);
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          processTextNode(node as Text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          processElementAttrs(node as Element);
        }
        node = walker.nextNode();
      }
    };

    isApplying = true;
    if (lang === "en") {
      for (const textNode of Array.from(trackedTexts)) {
        if (!textNode.isConnected) {
          trackedTexts.delete(textNode);
          continue;
        }
        processTextNode(textNode);
      }
    }
    walkSubtree(document.body);
    isApplying = false;

    if (lang !== "ar") {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (isApplying) return;
      isApplying = true;
      try {
        for (const m of mutations) {
          if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
            processTextNode(m.target as Text);
          } else if (m.type === "childList") {
            m.addedNodes.forEach((added) => walkSubtree(added));
          } else if (m.type === "attributes" && m.target.nodeType === Node.ELEMENT_NODE) {
            processElementAttrs(m.target as Element);
          }
        }
      } finally {
        isApplying = false;
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"],
    });

    return () => {
      observer.disconnect();
    };
  }, [hydrated, lang]);

  const value = useMemo(
    () => ({
      lang,
      isRtl: lang === "ar",
      setLang,
      toggleLang,
      t,
    }),
    [lang, setLang, toggleLang, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      role="group"
      aria-label={lang === "ar" ? "تغيير اللغة" : "Switch language"}
      data-no-translate="true"
      dir="ltr"
      className={`inline-flex items-center gap-0.5 rounded-full border border-[#dfe6eb] bg-[#f5f7f9] p-0.5 text-[10px] font-semibold text-[#5c6877] ${className}`}
    >
      <Globe size={12} aria-hidden="true" className="ml-1.5 mr-0.5 shrink-0 text-[#6d7988]" />
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`min-h-6 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
          lang === "en"
            ? "bg-white text-[#1f2c3a] shadow-xs"
            : "text-[#687585] hover:text-[#1f2c3a]"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("ar")}
        aria-pressed={lang === "ar"}
        className={`min-h-6 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
          lang === "ar"
            ? "bg-[#278968] text-white shadow-xs"
            : "text-[#687585] hover:text-[#1f2c3a]"
        }`}
      >
        العربية
      </button>
    </div>
  );
}
