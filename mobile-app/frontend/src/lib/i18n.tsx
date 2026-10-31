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

  // Upgraded Fitness Hub, Personal Routines & Progress Analytics
  "Progress": "التقدم",
  "Training & Routines": "التدريب والبرامج",
  "Workouts": "التمارين",
  "Workouts & routines": "التمارين والبرامج",
  "Start a gym plan or build your own routine": "ابدأ برنامج النادي أو أنشئ برنامجك الخاص",
  "Training streak & PRs": "سلسلة الالتزام والأرقام القياسية",
  "Track weights, reps, streaks & personal records":
    "تتبع الأوزان والتكرارات وسلسلة الالتزام والأرقام القياسية",
  "Open": "فتح",
  "Stats": "إحصائيات",
  "New Routine": "برنامج جديد",
  "Gym Plan": "برنامج النادي",
  "My Routines": "برامجي الخاصة",
  "Gym Assigned Plan": "برنامج مخصص من النادي",
  "Personal Routine": "برنامج شخصي",
  "Scheduled Today": "مجدول لليوم",
  "Scheduled 1-on-1 Coaching": "جلسات التدريب الفردي المجدولة",
  "Start Guided Workout": "بدء جلسة التمرين",
  "Start Workout": "بدء التمرين",
  "Copy to My Routines": "نسخ إلى برامجي",
  "Copying…": "جارٍ النسخ…",
  "Managed by your gym. Copy to My Routines if you want to customize exercises or sets personally.":
    "يُدار هذا البرنامج بواسطة ناديك. انسخه إلى برامجك الخاصة لتعديل التمارين أو المجموعات بحرية.",
  "No gym plan assigned yet": "لم يتم تعيين برنامج من النادي بعد",
  "Ask your coach or front desk to send a gym workout plan, or build your own personal routine right now.":
    "اطلب من مدربك أو الاستقبال إرسال برنامج تدريبي، أو أنشئ برنامجك الشخصي الآن.",
  "Create Personal Routine": "إنشاء برنامج شخصي",
  "Build your first personal routine": "أنشئ برنامجك التدريبي الأول",
  "Create custom splits (Push, Pull, Legs, Upper/Lower), schedule training days, and track weights & PRs automatically.":
    "صمّم تقسيماتك الخاصة وحدد أيام التمرين وتتبع الأوزان والأرقام القياسية تلقائياً.",
  "Ready to start": "جاهز للبدء",
  "Edit Routine": "تعديل البرنامج",
  "New Personal Routine": "برنامج شخصي جديد",
  "Routine Title": "اسم البرنامج",
  "e.g. Upper Body Power, Push Day A": "مثال: تمرين الجزء العلوي، يوم الدفع",
  "Primary Goal": "الهدف الأساسي",
  "Strength & Hypertrophy": "القوة وبناء العضلات",
  "Fat Loss & Conditioning": "حرق الدهون واللياقة",
  "Athletic Performance": "الأداء الرياضي",
  "Mobility & Core": "المرونة وتقوية الجذع",
  "General Fitness": "اللياقة العامة",
  "Weekly Schedule (optional)": "جدول الأيام الأسبوعي (اختياري)",
  "Add Exercise": "إضافة تمرين",
  "Hide Library": "إخفاء المكتبة",
  "Search bench, squat, lat pulldown...": "ابحث عن تمرين...",
  "All": "الكل",
  "Chest": "الصدر",
  "Back": "الظهر",
  "Shoulders": "الأكتاف",
  "Arms": "الذراعان",
  "Legs": "الأرجل",
  "Core": "البطن والجذع",
  "Full body": "كامل الجسم",
  "Cardio": "كارديو",
  "Add": "إضافة",
  "Or add custom exercise": "أو أضف تمريناً مخصصاً",
  "Custom exercise name": "اسم التمرين المخصص",
  "Sets": "مجموعات",
  "Reps": "تكرار",
  "Rest (s)": "راحة (ث)",
  "Target kg": "الوزن كجم",
  "Save Routine": "حفظ البرنامج",
  "Remove personal routine?": "حذف البرنامج الشخصي؟",
  "Remove": "حذف",
  "Removing…": "جارٍ الحذف…",
  "Personal routine created!": "تم إنشاء البرنامج الشخصي بنجاح!",
  "Personal routine updated.": "تم تحديث البرنامج الشخصي.",
  "Personal routine removed.": "تم حذف البرنامج الشخصي.",
  "Copied to My Routines! You can customize it anytime without changing your gym plan.":
    "تم النسخ إلى برامجك الخاصة! يمكنك تعديله في أي وقت دون التأثير على برنامج النادي.",
  "Gym Plan Session": "جلسة برنامج النادي",
  "Personal Routine Session": "جلسة برنامج شخصي",
  "Sets Done": "المجموعات المكتملة",
  "Total Reps": "إجمالي التكرارات",
  "Volume (kg)": "الحجم (كجم)",
  "Rest Timer": "مؤقت الراحة",
  "Skip": "تخطي",
  "Weight (kg)": "الوزن (كجم)",
  "Add Set": "إضافة مجموعة",
  "Discard Session": "إلغاء الجلسة",
  "Complete Session": "إنهاء الجلسة",
  "Completed Sets": "المجموعات المكتملة",
  "Volume": "الحجم",
  "Minutes": "الدقائق",
  "How did this session feel?": "كيف كان مستوى الجهد في الجلسة؟",
  "Session notes (optional)": "ملاحظات الجلسة (اختياري)",
  "Strong bench sets, felt great...": "أداء ممتاز اليوم...",
  "Keep Training": "متابعة التمرين",
  "Save Workout": "حفظ التمرين",
  "New Personal Record!": "رقم قياسي شخصي جديد!",
  "View PRs": "عرض الأرقام",
  "Analytics & History": "التحليلات والسجل",
  "Training Progress": "تقدم التدريب",
  "Last 30 Days": "آخر 30 يوماً",
  "30-Day Volume": "حجم 30 يوماً",
  "Active Streak": "سلسلة الالتزام",
  "Consecutive training days": "أيام تدريب متتالية",
  "Time Trained": "وقت التدريب",
  "Logged active duration": "إجمالي مدة التمارين المسجلة",
  "Last 7 Days": "آخر 7 أيام",
  "Daily total weight lifted (kg)": "إجمالي الأوزان المرفوعة يومياً (كجم)",
  "Daily workout duration (min)": "مدة التمرين اليومية (بالدقائق)",
  "Personal Records": "الأرقام القياسية الشخصية",
  "Top weight lifted per exercise": "أعلى وزن تم رفعه لكل تمرين",
  "Complete a workout with logged weights to unlock your Personal Records board.":
    "أكمل جلسة تمرين مع تسجيل الأوزان لإظهار لوحة أرقامك القياسية.",
  "Muscle Group Focus": "توزيع العضلات المستهدفة",
  "Completed sets by target muscle group": "المجموعات المكتملة حسب العضلة المستهدفة",
  "Workout History": "سجل التمارين",
  "No workouts logged yet": "لا توجد تمارين مسجلة بعد",
  "Start a session from your Gym Plan or Personal Routines to track every set and PR.":
    "ابدأ جلسة من برنامج النادي أو برامجك الخاصة لتتبع مجموعاتك وأرقامك القياسية.",
  "Go to Workouts": "الانتقال إلى التمارين",
  "Delete log": "حذف السجل",

  // Appearance & Theme Preferences
  "Application settings": "إعدادات التطبيق",
  "Appearance": "المظهر",
  "Appearance settings": "إعدادات المظهر",
  "Theme preference": "تفضيل المظهر",
  "Dark": "داكن",
  "Light": "فاتح",
  "System default": "افتراضي النظام",
  "Dark theme active": "الوضع الداكن مفعل",
  "Light theme active": "الوضع الفاتح مفعل",
  "Following device (Dark)": "يتبع إعداد الجهاز (داكن)",
  "Following device (Light)": "يتبع إعداد الجهاز (فاتح)",
  "Theme: Dark": "المظهر: داكن",
  "Theme: Light": "المظهر: فاتح",
  "Theme: System default": "المظهر: افتراضي النظام",

  // Personal Routine Builder & Weekly Split Management
  "Gym Routines": "برامج النادي",
  "Active Routine": "البرنامج النشط",
  "Active · Gym Routine": "نشط · برنامج النادي",
  "Start Next Training Day": "بدء يوم التمرين التالي",
  "Switch Routine": "تبديل البرنامج",
  "Build your own weekly routine": "صمّم برنامجك الأسبوعي الخاص",
  "Pick your training days, tap exercises from the searchable library, and train your way — no gym plan required.":
    "اختر أيام التمرين واضغط على التمارين من المكتبة وتدرّب بطريقتك دون الحاجة لبرنامج من النادي.",
  "Set Active": "تعيين كنشط",
  "From Gym Plan": "منسوخ من النادي",
  "View full weekly schedule": "عرض الجدول الأسبوعي بالكامل",
  "Hide weekly schedule": "إخفاء الجدول الأسبوعي",
  "Rest": "راحة",
  "Edit": "تعديل",
  "Copy": "نسخ",
  "Archive": "أرشفة",
  "Delete": "حذف",
  "Restore": "استعادة",
  "Assigned by Coach": "مخصص من المدرب",
  "Gym Routine": "برنامج النادي",
  "Set as Active": "تعيين كنشط",
  "Unselect Active": "إلغاء التفعيل",
  "Copy to My Routines to Customize": "نسخ إلى برامجي الخاصة للتعديل",
  "No gym routines published yet": "لا توجد برامج منشورة من النادي بعد",
  "Personal Routine Builder": "منشئ البرامج الخاصة",
  "Customize Routine": "تخصيص البرنامج التدريبي",
  "Routine Name": "اسم البرنامج",
  "Quick start:": "بداية سريعة:",
  "Weekly Schedule": "الجدول الأسبوعي",
  "View all 7 days": "عرض الأيام السبعة",
  "Hide week summary": "إخفاء ملخص الأسبوع",
  "Train": "تمرين",
  "Rest & recovery day": "يوم راحة واستشفاء",
  "+ Add exercises instead": "+ إضافة تمارين بدلاً من الراحة",
  "Scheduled as a recovery / rest day": "مجدول كيوم راحة واستشفاء",
  "Tap + Add Exercises to build this day": "اضغط + إضافة تمارين لبناء هذا اليوم",
  "Individual Set Targets": "أهداف المجموعات الفردية",
  "Customize each set": "تخصيص كل مجموعة",
  "Use uniform sets": "مجموعات موحدة",
  "+ Add note": "+ إضافة ملاحظة",
  "Hide note": "إخفاء الملاحظة",
  "+ Add set": "+ إضافة مجموعة",
  "− Remove last set": "− حذف آخر مجموعة",
  "Set as my active routine": "تعيين كبرنامجي النشط",
  "Select Exercises": "اختيار التمارين",
  "Search exercises or muscle group...": "ابحث عن التمارين أو العضلة المستهدفة...",
  "Tap exercises above to select": "اضغط على التمارين بالأعلى للاختيار",
  "Save Changes": "حفظ التعديلات",
  "Triceps": "ترايسبس",
  "Biceps": "بايسبس",
  "Glutes": "الأرداف",

  // Interactive Workout Session, Post-Check-In Entry & Smart Defaults
  "Ready to train?": "هل أنت مستعد للتمرين؟",
  "Jump straight into today's scheduled workout": "انتقل مباشرة إلى تمرينك المجدول لليوم",
  "Resume Workout": "استئناف التمرين",
  "Not now": "ليس الآن",
  "Workout in progress": "جلسة تمرين جارية",
  "Resume": "استئناف",
  "Freestyle": "تمرين حر",
  "Start Workout Now": "ابدأ التمرين الآن",
  "Start Unscheduled Workout": "بدء تمرين غير مجدول",
  "Today's Scheduled Split": "تمرين اليوم المجدول",
  "Active Gym Routine": "برنامج النادي النشط",
  "No active workout scheduled for today": "لا يوجد تمرين نشط مجدول لليوم",
  "Start an unscheduled session right away or pick any saved routine below.":
    "ابدأ جلسة تمرين حرة فوراً أو اختر أي برنامج محفوظ أدناه.",
  "Choose another routine or start unscheduled": "اختر برنامجاً آخر أو ابدأ تمريناً حراً",
  "Hide other options": "إخفاء الخيارات الأخرى",
  "Live Session": "جلسة مباشرة",
  "Saved": "محفوظ",
  "Syncing": "مزامنة",
  "Offline · Saved": "دون اتصال · محفوظ",
  "Finish": "إنهاء",
  "Form & Tempo Cue": "إرشادات الأداء السليم",
  "Hide demo": "إخفاء الشرح",
  "Demo": "الشرح",
  "Previous performance": "الأداء السابق",
  "First session · Smart defaults ready": "أول جلسة · القيم الذكية جاهزة",
  "Repetitions": "التكرارات",
  "Current workout sets": "مجموعات التمرين الحالي",
  "End Without Saving": "إنهاء دون حفظ",
  "Discard current workout?": "هل تريد إلغاء التمرين الحالي؟",
  "Keep Workout": "متابعة التمرين",
  "Add Exercise to Workout": "إضافة تمرين إلى الجلسة",
  "Pick your first exercise to begin": "اختر تمرينك الأول للبدء",
  "Choose Exercise": "اختيار تمرين",
  "Effort (1–5)": "مستوى الجهد (1–5)",
  "Swipe to complete": "اسحب للإتمام",
  "Workout rest timer": "مؤقت الراحة للتمرين",
  "Default rest duration, countdown vibration & background alerts":
    "مدة الراحة الافتراضية والاهتزاز وتنبيهات الخلفية",
  "Default rest duration": "مدة الراحة الافتراضية",
  "sec": "ثانية",
  "Rest vibration": "اهتزاز مؤقت الراحة",
  "Pulses during final 5s & strong alert at 0s":
    "نبضات خلال آخر 5 ثوانٍ واهتزاز قوي عند الصفر",
  "Preference saved · Device limits browser vibration":
    "تم حفظ التفضيل · الجهاز يقيّد اهتزاز المتصفح",
  "On": "مفعّل",
  "Off": "ميقف",
  "Rest notifications": "إشعارات انتهاء الراحة",
  "Local notifications unavailable in this browser":
    "الإشعارات المحلية غير متاحة في هذا المتصفح",
  "Blocked in device/browser notification settings":
    "محظورة في إعدادات إشعارات الجهاز أو المتصفح",
  "Notify when rest finishes in the background":
    "إشعار عند انتهاء فترة الراحة في الخلفية",
  "Allow device notification permission": "السماح بإذن إشعارات الجهاز",
  "Rest Timer Settings": "إعدادات مؤقت الراحة",
  "Paused": "متوقف مؤقتاً",
  "Pause": "إيقاف مؤقت",
  "Get Ready": "استعد",
  "Rest complete · Ready for your next set":
    "انتهت الراحة · جاهز للمجموعة التالية",
  "Settings": "الإعدادات",

  // Intelligent Workout Progression, Feedback & Exercise History
  "How did that feel?": "كيف كان شعورك في التمرين؟",
  "Optional · 1 tap to personalize your next session":
    "اختياري · ضغطة واحدة لتخصيص جلستك القادمة",
  "Feedback recorded · Review your next-session target below":
    "تم تسجيل تقييمك · راجع هدف جلستك القادمة أدناه",
  "Any discomfort?": "هل شعرت بانزعاج؟",
  "Discomfort noted": "تم تسجيل انزعاج",
  "Discomfort": "انزعاج",
  "Weight increases are automatically paused whenever discomfort is reported.":
    "يتم إيقاف زيادة الأوزان تلقائياً عند الإبلاغ عن أي ألم أو انزعاج.",
  "1–2: Extremely easy": "1–2: سهل جداً",
  "3–4: Easy": "3–4: سهل",
  "5–6: Moderate": "5–6: متوسط",
  "7–8: Difficult": "7–8: صعب",
  "9: Extremely difficult": "9: صعب جداً",
  "10: Maximum effort": "10: أقصى مجهود",
  "Edit rating": "تعديل التقييم",
  "Next Exercise": "التمرين التالي",
  "Adjust": "تعديل الهدف",
  "Ignore": "تجاهل",
  "Change": "تغيير",
  "Accepted": "مقبول",
  "Adjusted": "معدّل",
  "Ignored": "متجاهل",
  "Customize target for your next session": "تخصيص الهدف لجلستك القادمة",
  "Next Weight (kg)": "الوزن القادم (كجم)",
  "Next Reps": "التكرارات القادمة",
  "Save Adjusted Target": "حفظ الهدف المعدّل",
  "Apply Adjusted Target": "تطبيق الهدف المعدّل",
  "Save Target": "حفظ الهدف",
  "Suggestion ignored · Keeping your current target":
    "تم تجاهل الاقتراح · سيتم الإبقاء على هدفك الحالي",
  "Automated suggestion from your logged sets — not medical advice or personal coaching. Saved routines are never changed automatically.":
    "اقتراح تلقائي مبني على مجموعاتك المسجلة — وليس استشارة طبية أو تدريباً شخصياً. لا يتم تعديل برامجك المحفوظة تلقائياً.",
  "Suggested from last workout": "مقترح من التمرين السابق",
  "History": "السجل",
  "Exercise History": "سجل التمرين",
  "Personal Record": "الرقم القياسي",
  "Performance Trend": "اتجاه الأداء",
  "Improving": "في تحسّن",
  "Challenging": "مجهد",
  "Steady": "مستقر",
  "Baseline": "خط الأساس",
  "Next Session Targets": "أهداف الجلسة القادمة",
  "Saved routines remain unchanged unless you edit them directly":
    "تظل برامجك المحفوظة دون تغيير ما لم تقم بتعديلها بنفسك",
  "Adjust in Progress": "تعديل من صفحة التقدم",
  "Rules": "القواعد",
  "Progression Rules": "قواعد التدرج الذكي",
  "Customize how next-session suggestions respond to your difficulty ratings":
    "تحكم في كيفية استجابة اقتراحات الأوزان لتقييم صعوبة التمرين",
  "Progression Pace": "وتيرة التدرج",
  "Conservative": "متحفظ",
  "Balanced": "متوازن",
  "Aggressive": "متقدم",
  "Preferred Weight Increment": "مقدار الزيادة المفضل",
  "Auto": "تلقائي",
  "Progression preferences updated.": "تم تحديث تفضيلات التدرج بنجاح.",
  "Exercise History & Progression": "سجل التمارين والتدرج",
  "Previous weights, reps, PRs, trends & difficulty ratings":
    "الأوزان السابقة والتكرارات والأرقام القياسية واتجاهات الأداء وتقييم الصعوبة",
  "Complete an exercise to track your weight progression, PRs, and difficulty trends.":
    "أكمل تمريناً لتتبع تدرج أوزانك وأرقامك القياسية واتجاهات أدائك.",
  "Next Session Suggestion": "اقتراح الجلسة القادمة",
  "Suggestions are rule-based calculations from your logged sets — not medical advice or personal coaching. Saved routines are never modified automatically.":
    "الاقتراحات محسوبة آلياً وفق مجموعاتك المسجلة — وليست استشارة طبية أو تدريباً شخصياً، ولا تعدّل برامجك المحفوظة تلقائياً.",
  "Progression suggestions are automated calculations based on your logged sets and effort ratings — not medical advice or professional coaching. Listen to your body and consult a qualified professional if you experience pain.":
    "اقتراحات التدرج هي حسابات آلية مبنية على مجموعاتك المسجلة وتقييم الجهد — وليست نصيحة طبية أو تدريباً احترافياً. استمع لجسمك واستشر مختصاً مؤهلاً إذا شعرت بأي ألم.",

  // Prompt 1: Exercise Demonstrations & Exercise Library
  Play: "تشغيل",
  Hide: "إخفاء",
  "No clip": "بدون عرض",
  "Form cue": "إرشاد الأداء",
  Library: "المكتبة",
  "Exercise Library": "مكتبة التمارين",
  "Movement Guide": "دليل الحركة",
  "Close exercise library": "إغلاق مكتبة التمارين",
  "Search exercise library": "ابحث في مكتبة التمارين",
  "Search exercise, equipment, or muscle...": "ابحث عن تمرين أو أداة أو عضلة...",
  "Horizontal Press": "دفع أفقي",
  "Knee-Dominant Squat": "سكوات",
  "Hip Hinge Pull": "سحب مفصل الورك",
  "Vertical Pull": "سحب عمودي",
  "Overhead Press": "دفع علوي",
  "Elbow Flexion": "ثني المرفق",
  "Horizontal Row": "سحب أفقي",
  "Elbow Extension": "مد المرفق",
  "Shoulder Abduction": "رفع جانبي للكتف",
  "Unilateral Split": "اندفاع فردي",
  "Hip Extension": "مد الورك",
  "Core Bracing": "تثبيت الجذع",
  Barbell: "بار حديدي",
  Dumbbells: "دمبلز",
  Dumbbell: "دمبل",
  Cables: "كوابل",
  Cable: "كيبل",
  "Cable Machine": "جهاز الكيبل",
  Machine: "جهاز",
  Bodyweight: "وزن الجسم",
  "Pull-Up Bar": "عقلة",
  "Cable / Dumbbell": "كيبل / دمبل",
  "Gym Equipment": "معدات الصالة",
  "Move through a controlled range of motion with steady breathing.":
    "تحرك بمدى حركي متحكم فيه مع تنفس منتظم.",
  "No visual demo linked yet — use controlled tempo and comfortable range of motion.":
    "لا يوجد عرض توضيحي مرتبط بعد — التزم بإيقاع متحكم ومدى حركي مريح.",
  "Retract shoulder blades, lower bar with control to mid-chest, drive smoothly.":
    "ضم لوحي الكتف للخلف، أنزل البار بتحكم لمنتصف الصدر ثم ادفع بسلاسة.",
  "Set bench to 30 degrees, keep wrists stacked above elbows throughout each rep.":
    "اضبط المقعد على زاوية 30 درجة وحافظ على استقامة المعصمين فوق المرفقين طوال التكرار.",
  "Maintain a slight elbow bend and bring hands together in a smooth arc.":
    "حافظ على انثناء خفيف في المرفقين واجمع اليدين في قوس سلس.",
  "Brace core in a straight line from head to heels and lower chest with control.":
    "شد الجذع في خط مستقيم من الرأس للكعبين وأنزل الصدر بتحكم.",
  "Brace torso, sit hips down between heels, keep knees tracking over toes.":
    "شد الجذع، أنزل الوركين بين الكعبين وحافظ على اتجاه الركبتين مع أصابع القدم.",
  "Hold weight close to sternum, keep chest tall, and pause briefly at depth.":
    "أمسك الوزن قريباً من الصدر، حافظ على استقامة الجذع وتوقف لحظة في الأسفل.",
  "Keep lower back pressed firmly into the pad and drive evenly through mid-foot.":
    "أبقِ أسفل الظهر ملاصقاً للمسند وادفع بالتساوي بمنتصف القدم.",
  "Set lats tight, keep bar close to shins, push the floor away with neutral spine.":
    "شد عضلات الظهر، أبقِ البار قريباً من الساقين وادفع الأرض بعمود فقري مستقيم.",
  "Hinge hips back with soft knees until hamstrings load, then drive hips through.":
    "ادفع الوركين للخلف مع ثني خفيف للركبتين حتى تشعر بشد الخلفيات ثم ادفع للأمام.",
  "Draw elbows down toward your ribs while keeping ribs stacked and torso steady.":
    "اسحب المرفقين لأسفل باتجاه الأضلاع مع ثبات الجذع.",
  "Initiate from shoulder blades, pull chest toward bar, and lower to full hang.":
    "ابدأ الحركة من لوحي الكتف، اسحب الصدر نحو العقلة وانزل بتحكم كامل.",
  "Squeeze glutes and core, press vertically past forehead, lock out over mid-foot.":
    "شد المؤخرة والجذع وادفع البار عمودياً للأعلى مع الثبات فوق منتصف القدم.",
  "Press dumbbells slightly inward at the top without arching your lower back.":
    "ادفع الدمبلز للأعلى وللداخل قليلاً دون تقويس أسفل الظهر.",
  "Lead with elbows in the scapular plane and pause briefly at shoulder height.":
    "ارفع بالمرفقين في مستوى الكتف وتوقف لحظة عند ارتفاع الكتفين.",
  "Pin upper arms by your sides, curl smoothly without torso swing, lower slowly.":
    "ثبّت أعلى الذراعين بجانب الجسم وارفع بسلاسة دون أرجحة الجذع ثم أنزل ببطء.",
  "Keep neutral palms facing inward and control the eccentric all the way down.":
    "حافظ على اتجاه الكفين للداخل وتحكم في النزول بالكامل.",
  "Sit tall, drive elbows past torso, squeeze mid-back, and let scapulae protract cleanly.":
    "اجلس باستقامة، اسحب المرفقين خلف الجذع واعصر منتصف الظهر بتحكم.",
  "Hold a stable hip hinge and row the bar toward your lower sternum.":
    "حافظ على ثبات ميلان الجذع واسحب البار نحو أسفل الصدر.",
  "Keep elbows tucked at your sides and spread the rope gently at full extension.":
    "ثبّت المرفقين بجانب الجسم وافتح الحبل برفق عند المد الكامل.",
  "Step long enough for a 90-degree front knee angle and push up through front heel.":
    "اخطُ بمسافة تحقق زاوية 90 درجة للركبة الأمامية وادفع بالكعب الأمامي.",
  "Keep chin tucked, shins vertical at lockout, and pause 1 second at full glute squeeze.":
    "أبقِ الذقن للداخل والساقين عموديتين في الأعلى وتوقف ثانية مع شد المؤخرة.",
  "Align knee joint with machine pivot and control the return phase.":
    "حاذِ مفصل الركبة مع محور الجهاز وتحكم في مرحلة الرجوع.",
  "Use a full stretch at the bottom and pause cleanly on the balls of your feet.":
    "انزل لتمدد كامل في الأسفل وتوقف بثبات في الأعلى على مشط القدم.",
  "Pull rope toward forehead while externally rotating thumbs behind ears.":
    "اسحب الحبل نحو الجبهة مع تدوير الإبهامين للخارج خلف الأذنين.",
  "Keep ribs down and stretch triceps fully behind head before extending.":
    "حافظ على ثبات الأضلاع ومد الترايسبس خلف الرأس بالكامل قبل الدفع.",
  "Stack elbows under shoulders, tuck pelvis slightly, and breathe steadily behind brace.":
    "ضع المرفقين تحت الكتفين، اضبط الحوض وتنفس بانتظام مع شد الجذع.",
  "Curl pelvis upward with control rather than swinging legs with momentum.":
    "ارفع الحوض للأعلى بتحكم بدلاً من أرجحة الساقين بالاندفاع.",

  // Prompt 2: Member Home Screen Redesign
  Home: "الرئيسية",
  "Good morning": "صباح الخير",
  "Good afternoon": "مساء الخير",
  "Good evening": "مساء الخير",
  "Today's Workout": "تمرين اليوم",
  "Today’s Workout": "تمرين اليوم",
  "Rest Day": "يوم راحة",
  "Scheduled rest & recovery day": "يوم راحة واستشفاء مجدول",
  "Open Workouts": "فتح التمارين",
  "No workout scheduled today": "لا يوجد تمرين مجدول اليوم",
  "Create a personal routine or start a workout anytime.":
    "أنشئ برنامجاً شخصياً أو ابدأ تمريناً في أي وقت.",
  "Your active workout session is saved and ready to continue.":
    "جلسة تمرينك النشطة محفوظة وجاهزة للمتابعة.",
  "Quick Access": "وصول سريع",
  "Quick access": "وصول سريع",
  "Demos & form cues": "عروض وإرشادات الأداء",
  "Charts & PRs": "مخططات وأرقام قياسية",
  "Progress summary": "ملخص التقدم",
  "This month": "هذا الشهر",
  Streak: "الالتزام",
  PRs: "أرقام قياسية",
  "Recent Activity": "النشاط الأخير",
  "Recent activity": "النشاط الأخير",
  "No completed workouts yet — finish your first session to see it here.":
    "لا توجد تمارين مكتملة بعد — أنهِ جلستك الأولى لتظهر هنا.",
  "Active routine schedule": "جدول البرنامج النشط",
  "No routine selected": "لم يتم اختيار برنامج",
  Manage: "إدارة",
  "Build a custom weekly split or follow a gym workout plan.":
    "صمّم جدولاً أسبوعياً مخصصاً أو اتبع برنامج الصالة.",

  // Prompt 3: Workout History & Exercise Progress Charts
  "7D": "7ي",
  "30D": "30ي",
  "90D": "90ي",
  "Progress and history sections": "أقسام التقدم والسجل",
  "Select date range": "اختر النطاق الزمني",
  "Exercise progression analytics": "تحليلات تدرج التمارين",
  "Exercise Progression Charts": "مخططات تطور التمارين",
  "Weight & rep trends, PRs, and training frequency over time":
    "اتجاهات الأوزان والتكرارات والأرقام القياسية ومعدل التدريب",
  Weight: "الوزن",
  "Top Set Weight Trend": "اتجاه أعلى وزن للمجموعة",
  "Best Set Reps Trend": "اتجاه أفضل تكرارات للمجموعة",
  "Exercise weight progression chart": "مخطط تطور وزن التمرين",
  "Exercise rep progression chart": "مخطط تطور تكرارات التمرين",
  "No logged sets for this exercise in the selected date range.":
    "لا توجد مجموعات مسجلة لهذا التمرين في النطاق الزمني المحدد.",
  "Complete a workout to unlock per-exercise weight and rep progression charts.":
    "أكمل تمريناً لتفعيل مخططات تطور الوزن والتكرارات لكل تمرين.",
  "Filter exercises...": "تصفية التمارين...",
  "Filter exercises": "تصفية التمارين",
  "Heaviest PR": "أعلى وزن قياسي",
  "Best Set Vol": "أفضل حجم مجموعة",
  "Single set": "مجموعة واحدة",
  Frequency: "معدل التكرار",
  Latest: "الأحدث",
  "Free Workout": "تمرين حر",
  Details: "التفاصيل",
  "Collapse session": "طي الجلسة",
  "Expand session": "توسيع الجلسة",
  "Close session details": "إغلاق تفاصيل الجلسة",
  Exercises: "التمارين",
  "Search routine or exercise...": "ابحث عن برنامج أو تمرين...",
  "Search workout history": "ابحث في سجل التمارين",
  "No workout sessions match the selected date range or search filter.":
    "لا توجد جلسات تطابق النطاق الزمني أو البحث المحدد.",

  // Prompt 4: Lightweight Achievements & Personal Records
  Achievements: "الإنجازات",
  "Milestone Reached": "إنجاز جديد",
  "Milestone unlocked": "تم تحقيق إنجاز",
  "Dismiss milestone notification": "إغلاق إشعار الإنجاز",
  "Date range": "النطاق الزمني",
  "Achievements and personal records": "الإنجازات والأرقام القياسية",
  Milestones: "المحطات",
  "Best streak": "أطول التزام",
  "Exercise PRs": "أرقام التمارين",
  "Training Milestones": "محطات التدريب",
  "Earned strictly from verified completed workouts":
    "محسوبة حصرياً من جلسات التمرين المكتملة والموثقة",
  Unlocked: "محقق",
  "First Session Logged": "تسجيل الجلسة الأولى",
  "Complete your first valid training session.":
    "أكمل جلستك التدريبية الأولى بنجاح.",
  "First Personal Record": "أول رقم قياسي شخصي",
  "Establish your first verified exercise personal record.":
    "حقق أول رقم قياسي موثق في أحد التمارين.",
  "10 Workouts Completed": "إتمام 10 جلسات تدريبية",
  "Log 10 complete training sessions.":
    "سجّل 10 جلسات تدريبية مكتملة.",
  "7-Day Training Streak": "التزام لمدة 7 أيام متتالية",
  "Train on 7 consecutive days.":
    "تدرّب خلال 7 أيام متتالية.",
  "4 Consistent Weeks": "انتظام لمدة 4 أسابيع",
  "Complete workouts across 4 consecutive weeks.":
    "أكمل تمارين خلال 4 أسابيع متتالية.",
  "50 Workouts Completed": "إتمام 50 جلسة تدريبية",
  "Reach 50 complete training sessions.":
    "وصلت إلى 50 جلسة تدريبية مكتملة.",
  "Exercise Personal Records": "الأرقام القياسية للتمارين",
  "Heaviest weight, highest reps at weight & best single-set performance":
    "أعلى وزن، وأعلى تكرارات بوزن، وأفضل أداء لمجموعة واحدة",
  "Complete a workout with logged sets to establish your exercise personal records.":
    "أكمل تمريناً بمجموعات مسجلة لتأسيس أرقامك القياسية في التمارين.",
  Heaviest: "أعلى وزن",
  "Most Reps": "أعلى تكرارات",
  "Best Set": "أفضل مجموعة",

  // Prompt 5: Free Workout Mode
  "Start Free Workout": "ابدأ تمريناً حراً",
  "Pick exercises dynamically without changing your active routine.":
    "اختر تمارينك بحرية دون تغيير جدولك النشط.",
  "Create a personal routine or start a free workout anytime.":
    "أنشئ جدولاً شخصياً أو ابدأ تمريناً حراً في أي وقت.",
  "Remove Exercise": "إزالة التمرين",
  "Tap + for smart defaults or Configure to set sets, reps & weight":
    "اضغط + للإعدادات التلقائية أو تخصيص لضبط المجموعات والتكرارات والوزن",
  "Add custom exercise to this workout": "إضافة تمرين مخصص لهذه الجلسة",
  "Custom exercise muscle group": "العضلة المستهدفة للتمرين المخصص",
  "Add Custom Exercise": "إضافة تمرين مخصص",
  "Add Configured Exercise": "إضافة التمرين بالتخصيص",
  Configure: "تخصيص",
  "Save as reusable Personal Routine": "حفظ كجدول شخصي قابل لإعادة الاستخدام",
  "Adds to My Routines without overwriting your active routine.":
    "يُضاف إلى جداولي دون استبدال جدولك النشط.",
  "Routine name": "اسم الجدول",
  "e.g. Upper Body Pump": "مثال: تمرين الجزء العلوي",
  "Save Free Workout as a Personal Routine?": "حفظ التمرين الحر كجدول شخصي؟",
  "Keep this exercise lineup in My Routines without overwriting your active routine.":
    "احتفظ بهذه التمارين في جداولي دون استبدال جدولك النشط.",
  "Dismiss save routine prompt": "إغلاق اقتراح حفظ الجدول",
  "Routine name for saved free workout": "اسم الجدول للتمرين الحر المحفوظ",
  "Save as Routine": "حفظ كجدول",
  "Choose another routine or start free workout":
    "اختر جدولاً آخر أو ابدأ تمريناً حراً",

  // Prompt 6 QA Polish: Standalone Weekdays, Difficulty Labels & Built-in Exercise Names
  Saturday: "السبت",
  Sunday: "الأحد",
  Monday: "الاثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
  "Very Easy": "سهل جداً",
  Easy: "سهل",
  Moderate: "متوسط",
  Hard: "صعب",
  "Max Effort": "أقصى جهد",
  "Barbell Bench Press": "ضغط صدر بالبار",
  "Incline Dumbbell Press": "ضغط صدر عالي بالدمبل",
  "Dumbbell Chest Fly": "تفتيح صدر بالدمبل",
  "Push-Up": "تمرين الضغط",
  "Cable Crossover": "تقاطع الكابل للصدر",
  "Lat Pulldown": "سحب عالي للظهر",
  "Seated Cable Row": "سحب أرضي جالس بالكابل",
  "Barbell Bent-Over Row": "تجديف منحني بالبار",
  "Pull-Up": "العقلة",
  "Single-Arm Dumbbell Row": "تجديف دمبل بيد واحدة",
  "Barbell Back Squat": "سكوات خلفي بالبار",
  "Romanian Deadlift": "رفعة مميتة رومانية",
  "Conventional Deadlift": "رفعة مميتة تقليدية",
  "Leg Press": "مكبس الأرجل",
  "Walking Dumbbell Lunge": "طعن مشي بالدمبل",
  "Leg Extension": "مد الأرجل على الجهاز",
  "Seated Leg Curl": "ثني الأرجل جالساً",
  "Barbell Hip Thrust": "دفع الورك بالبار",
  "Standing Calf Raise": "رفع السمانة واقفاً",
  "Dumbbell Shoulder Press": "ضغط أكتاف بالدمبل",
  "Barbell Overhead Press": "ضغط أكتاف واقف بالبار",
  "Dumbbell Lateral Raise": "رفرفة جانبية بالدمبل",
  "Face Pull": "سحب الحبل للوجه",
  "Dumbbell Bicep Curl": "تبادل بايسبس بالدمبل",
  "Barbell EZ-Bar Curl": "مرجحة بايسبس بالبار المتعرج",
  "Cable Tricep Pushdown": "دفع الكابل للترايسبس",
  "Overhead Tricep Extension": "مد الترايسبس خلف الرأس",
  Plank: "بلانك",
  "Hanging Leg Raise": "رفع الأرجل معلقاً",
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
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:,\s*(\d{1,2}:\d{2})|\s+(\d{4}))?\b/g,
    (_, d: string, mo: string, tm?: string, yr?: string) => {
      const mAr = EN_MONTHS[mo] ?? mo;
      if (tm) return `${d} ${mAr}، ${tm}`;
      if (yr) return `${d} ${mAr} ${yr}`;
      return `${d} ${mAr}`;
    },
  );

  out = out.replace(/\b(\d{1,2}:\d{2})\s*AM\b/gi, "$1 ص");
  out = out.replace(/\b(\d{1,2}:\d{2})\s*PM\b/gi, "$1 م");
  return out;
}

const AR_PATTERNS: Array<[RegExp, (...args: string[]) => string]> = [
  [/^All sets completed for\s+(.+)$/i, (_, name) => `اكتملت جميع مجموعات ${name}`],
  [
    /^Accept\s*\(([\d.]+)\s*kg\s*×\s*(\d+)\)$/i,
    (_, w, r) => `قبول (${w} كجم × ${r})`,
  ],
  [/^Accept\s*\((\d+)\s*reps\)$/i, (_, r) => `قبول (${r} تكرار)`],
  [/^Continue to\s+(.+)$/i, (_, name) => `المتابعة إلى ${name}`],
  [
    /^Felt\s+(\d+)\/10\s*[·•]\s*(.+)$/i,
    (_, score) => `الصعوبة ${score}/10`,
  ],
  [
    /^Last effort:\s*(\d+)\/10\s*\((.+)\)$/i,
    (_, score) => `الجهد السابق: ${score}/10`,
  ],
  [/^Effort\s+(\d+)\/10$/i, (_, score) => `الجهد ${score}/10`],
  [
    /^Great work! Consider increasing to\s+([\d.]+)\s*kg next time\.$/i,
    (_, w) => `عمل رائع! فكّر في الزيادة إلى ${w} كجم في الجلسة القادمة.`,
  ],
  [
    /^Good session\. Keep\s+([\d.]+)\s*kg and aim for cleaner repetitions\.$/i,
    (_, w) => `جلسة جيدة. حافظ على وزن ${w} كجم واستهدف تكرارات أكثر إتقاناً.`,
  ],
  [
    /^That looked challenging\. Consider reducing to\s+([\d.]+)\s*kg next time to hit all target reps\.$/i,
    (_, w) => `بدا التمرين مجهداً. فكّر في تخفيض الوزن إلى ${w} كجم في المرة القادمة لتحقيق التكرارات المستهدفة.`,
  ],
  [/^Exercise\s+(\d+)\s+of\s+(\d+)$/i, (_, i, n) => `التمرين ${i} من ${n}`],
  [
    /^Current Set\s*[·•]\s*Set\s+(\d+)\s+of\s+(\d+)$/i,
    (_, i, n) => `المجموعة الحالية · ${i} من ${n}`,
  ],
  [/^Swipe Set\s+(\d+)\s+to complete$/i, (_, n) => `اسحب لإتمام المجموعة ${n}`],
  [/^Complete Set\s+(\d+)$/i, (_, n) => `إتمام المجموعة ${n}`],
  [/^Rest\s+(\d+)s$/i, (_, s) => `راحة ${s}ث`],
  [
    /^No workout scheduled for\s+(.+)$/i,
    (_, day) => `لا يوجد تمرين مجدول ليوم ${EN_WEEKDAYS[day] ?? day}`,
  ],
  [/^Today is a rest day on "(.+)"$/i, (_, name) => `اليوم يوم راحة في "${name}"`],
  [
    /^Ready to train\?\s*[·•]\s*(.+)$/i,
    (_, day) => `هل أنت مستعد للتمرين؟ · ${EN_WEEKDAYS[day] ?? day}`,
  ],
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
  [/^(\d+)\s+sets$/i, (_, n) => `${n} مجموعات`],
  [
    /^([^·0-9]+)\s+sets$/i,
    (_, ex) => `مجموعات ${EXACT_AR[ex.trim()] ?? ex.trim()}`,
  ],
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
  [/^(\d+)d\s+streak$/i, (_, n) => `التزام ${n} يوم`],
  [/^Finish Workout\s*\((\d+)\)$/i, (_, n) => `إنهاء التمرين (${n})`],
  [/^Exercises\s*\((\d+)\)$/i, (_, n) => `التمارين (${n})`],
  [/^(\d+)\s+sessions?$/i, (_, n) => `${n} جلسات`],
  [/^(\d+)\s+sets$/i, (_, n) => `${n} مجموعات`],
  [/^Saved\s+"(.+)"\s+to your training history!$/i, (_, t) => `تم حفظ "${t}" في سجل تمارينك!`],
  [/^·\s*(.+)$/i, (_, eq) => `· ${EXACT_AR[eq] ?? eq}`],
  [/^(.+)\s+demonstration$/i, (_, name) => `عرض توضيحي لتمرين ${EXACT_AR[name] ?? name}`],
  [/^Add\s+(.+)$/i, (_, name) => `إضافة ${EXACT_AR[name] ?? name}`],
  [/^Select\s+(.+)$/i, (_, name) => `اختيار ${EXACT_AR[name] ?? name}`],
  [
    /^([A-Za-z ]+)\s*·\s*([A-Za-z /-]+)\s*·\s*(\d+)\s*×\s*([0-9A-Za-z-]+)(?:\s*·\s*PR\s*([\d.]+)\s*kg)?$/i,
    (_, muscle, equip, s, r, pr) =>
      `${EXACT_AR[muscle.trim()] ?? muscle.trim()} · ${EXACT_AR[equip.trim()] ?? equip.trim()} · ${s} × ${r}${pr ? ` · رقم قياسي ${pr} كجم` : ""}`,
  ],
  [/^(\d+)\/(\d+)\s+sets done$/i, (_, a, b) => `${a}/${b} مجموعات مكتملة`],
  [
    /^(\d+)\s+exercises?\s*·\s*~(\d+)\s+min$/i,
    (_, n, m) => `${n} تمارين · ~${m} دقيقة`,
  ],
  [
    /^Next workout:\s*(.+)$/i,
    (_, label) => {
      const parts = label.split("·").map((s: string) => s.trim());
      if (parts.length === 2) {
        return `التمرين القادم: ${EN_WEEKDAYS[parts[0]] ?? parts[0]} · ${EXACT_AR[parts[1]] ?? parts[1]}`;
      }
      return `التمرين القادم: ${label}`;
    },
  ],
  [/^Active routine:\s*(.+)$/i, (_, name) => `البرنامج النشط: ${name}`],
  [/^(\d+)\s+saved$/i, (_, n) => `${n} محفوظ`],
  [
    /^(.+)\s*·\s*(\d+)\s+min\s*·\s*(\d+)\s+sets$/i,
    (_, dt, mins, sets) =>
      `${EXACT_AR[dt.trim()] ?? translateDatesAndCurrency(dt.trim())} · ${mins} دقيقة · ${sets} مجموعات`,
  ],
  [/^Gym plan\s*·\s*(\d+)\s+exercises?$/i, (_, n) => `برنامج الصالة · ${n} تمارين`],
  [/^(\d+)ex$/i, (_, n) => `${n}ت`],
  [/^History\s*\((\d+)\)$/i, (_, n) => `السجل (${n})`],
  [/^(\d+)\s+sessions plotted$/i, (_, n) => `${n} جلسات ممثلة`],
  [/^×\s*(\d+)\s+reps$/i, (_, r) => `× ${r} تكرار`],
  [/^(\d+)\s+in range$/i, (_, n) => `${n} ضمن النطاق`],
  [
    /^(\d+)\s+exercises?\s*·\s*(.+?)\s*·\s*(\d+)\s+sets\s*·?$/i,
    (_, ex, dur, s) => `${ex} تمارين · ${dur.replace(/\bmin\b/i, "دقيقة")} · ${s} مجموعات ·`,
  ],
  [/^Inspect\s+(.+)\s+details$/i, (_, title) => `عرض تفاصيل ${title}`],
  [/^Total reps completed:\s*(\d+)$/i, (_, r) => `إجمالي التكرارات المكتملة: ${r}`],
  [/^Session effort:\s*(\d+)\/5$/i, (_, e) => `جهد الجلسة: ${e}/5`],
  [/^Set\s+(\d+)$/i, (_, n) => `المجموعة ${n}`],
  [/^Achievements\s*\((\d+)\/(\d+)\)$/i, (_, a, b) => `الإنجازات (${a}/${b})`],
  [
    /^(\d+)\s*\/\s*(\d+)\s+(workout|workouts|PR|days|weeks)$/i,
    (_, cur, tgt, unit) => {
      const unitAr =
        unit.toLowerCase() === "pr"
          ? "رقم قياسي"
          : unit.toLowerCase() === "days"
            ? "أيام"
            : unit.toLowerCase() === "weeks"
              ? "أسابيع"
              : "جلسات";
      return `${cur} / ${tgt} ${unitAr}`;
    },
  ],
  [
    /^Saved\s+"(.+)"\s+to My Routines\.$/i,
    (_, title) => `تم حفظ "${title}" في جداولي.`,
  ],
  [
    /^Workout logged & saved as\s+"(.+)"\s+in My Routines\.$/i,
    (_, title) => `تم تسجيل التمرين وحفظه باسم "${title}" في جداولي.`,
  ],
  [
    /^Free Workout\s*\((.+)\)$/i,
    (_, dt) => `تمرين حر (${translateDatesAndCurrency(dt)})`,
  ],
  [
    /^Add\s+(.+)$/i,
    (_, ex) => `إضافة ${EXACT_AR[ex.trim()] ?? ex.trim()}`,
  ],
  [
    /^Sets for\s+(.+)$/i,
    (_, ex) => `مجموعات ${EXACT_AR[ex.trim()] ?? ex.trim()}`,
  ],
  [
    /^Reps for\s+(.+)$/i,
    (_, ex) => `تكرارات ${EXACT_AR[ex.trim()] ?? ex.trim()}`,
  ],
  [
    /^Weight kg for\s+(.+)$/i,
    (_, ex) => `الوزن (كجم) لـ ${EXACT_AR[ex.trim()] ?? ex.trim()}`,
  ],
  [
    /^(.+)\s*·\s*(\d+)\s*min\s*·\s*(\d+)\s*(set|sets)$/i,
    (_, when, mins, sets) => {
      const wTrim = when.trim();
      const wAr =
        wTrim.toLowerCase() === "today"
          ? "اليوم"
          : wTrim.toLowerCase() === "yesterday"
            ? "أمس"
            : translateDatesAndCurrency(wTrim);
      return `${wAr} · ${mins} دقيقة · ${sets} مجموعات`;
    },
  ],
  [
    /^(\d+)\s+this week\s*·\s*(\d+)\s+total$/i,
    (_, wk, tot) => `${wk} هذا الأسبوع · ${tot} إجمالي`,
  ],
  [
    /^([\d,.]+)\s*kg lifetime$/i,
    (_, vol) => `${vol} كجم إجمالي`,
  ],
  [
    /^(\d+)\s+(exercise|exercises)$/i,
    (_, n) => `${n} تمارين`,
  ],
  [
    /^(\d+)\/10\s*·\s*(.+)$/i,
    (_, score, label) => `${score}/10 · ${EXACT_AR[label.trim()] ?? label.trim()}`,
  ],
  [
    /^(Chest|Back|Legs|Shoulders|Arms|Core|Full body)\s*·\s*(.+)$/i,
    (_, m, dt) => `${EXACT_AR[m] ?? m} · ${translateDatesAndCurrency(dt.trim())}`,
  ],
  [/^Achieved\s+(.+)$/i, (_, dt) => `تحقق في ${translateDatesAndCurrency(dt)}`],
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
      className={`inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-subtle p-0.5 text-[10px] font-semibold text-ink-secondary ${className}`}
    >
      <Globe size={12} aria-hidden="true" className="ml-1.5 mr-0.5 shrink-0 text-ink-muted" />
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`min-h-6 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
          lang === "en"
            ? "bg-elevated text-ink"
            : "text-ink-secondary hover:text-ink"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("ar")}
        aria-pressed={lang === "ar"}
        className={`min-h-6 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
          lang === "ar"
            ? "bg-accent text-on-accent"
            : "text-ink-secondary hover:text-ink"
        }`}
      >
        العربية
      </button>
    </div>
  );
}
