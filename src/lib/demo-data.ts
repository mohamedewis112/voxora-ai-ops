/**
 * Voxora AI — Demo dataset
 * ----------------------------
 * Realistic Egyptian-business demo data (no lorem ipsum).
 * Phone numbers are obviously fake (010000000xx) per safety requirements.
 *
 * SIM_SCRIPTS at the bottom is consumed by the Mock telephony provider to
 * simulate live conversations. It is NOT real telephony.
 */

import type {
  AgentConfig,
  AppSettings,
  Call,
  Campaign,
  Contact,
  FollowUp,
  KBItem,
  Lead,
  QueueItem,
  TranscriptLine,
} from "./types";
import { uid } from "./types";

/* ----------------------------- deterministic RNG --------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20250101);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const now = () => Date.now();
const hoursAgo = (h: number) => new Date(now() - h * 3600_000).toISOString();
const daysAgo = (d: number, h = 10, m = randInt(0, 55)) => {
  const dt = new Date(now() - d * 86400_000);
  dt.setHours(h, m, 0, 0);
  return dt.toISOString();
};
const inDays = (d: number, h = 11, m = 30) => {
  const dt = new Date(now() + d * 86400_000);
  dt.setHours(h, m, 0, 0);
  return dt.toISOString();
};

/* --------------------------------- campaigns ------------------------------- */

export const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: "cmp_1",
    name: "ربط أصحاب الأنشطة",
    purpose: "التعريف بخدمة الموظف الذكي للهاتف وتسجيل اهتمام أصحاب الأنشطة التجارية وتحويل المهتمين لموظفي المبيعات",
    callType: "outbound_sales",
    startDate: daysAgo(21),
    timeFrom: "10:00",
    timeTo: "18:00",
    maxCallsPerDay: 120,
    retryAttempts: 3,
    retryDelayHours: 4,
    agentId: "agent_1",
    knowledgeIds: ["kb_1", "kb_2", "kb_5"],
    status: "running",
    createdAt: daysAgo(21),
  },
  {
    id: "cmp_2",
    name: "متابعة العملاء",
    purpose: "الاتصال بالعملاء الحاليين للتأكد من رضاهم عن الخدمة وحل أي مشاكل فنية",
    callType: "followup",
    startDate: daysAgo(14),
    timeFrom: "11:00",
    timeTo: "17:00",
    maxCallsPerDay: 60,
    retryAttempts: 2,
    retryDelayHours: 6,
    agentId: "agent_1",
    knowledgeIds: ["kb_1", "kb_5"],
    status: "running",
    createdAt: daysAgo(14),
  },
  {
    id: "cmp_3",
    name: "تجديد الاشتراكات",
    purpose: "التواصل مع العملاء قبل انتهاء اشتراكاتهم بـ 10 أيام وتجديد الباقة الحالية أو ترقيتها",
    callType: "outbound_sales",
    startDate: inDays(5),
    timeFrom: "10:00",
    timeTo: "17:00",
    maxCallsPerDay: 80,
    retryAttempts: 3,
    retryDelayHours: 24,
    agentId: "agent_1",
    knowledgeIds: ["kb_2", "kb_5"],
    status: "scheduled",
    createdAt: daysAgo(3),
  },
  {
    id: "cmp_4",
    name: "خدمة العملاء",
    purpose: "استقبال مكالمات العملاء الواردة والرد على الاستفسارات وتسجيل الشكاوى",
    callType: "customer_service",
    startDate: daysAgo(30),
    timeFrom: "09:00",
    timeTo: "21:00",
    maxCallsPerDay: 200,
    retryAttempts: 0,
    retryDelayHours: 0,
    agentId: "agent_1",
    knowledgeIds: ["kb_1", "kb_2", "kb_3", "kb_4", "kb_5", "kb_6"],
    status: "running",
    createdAt: daysAgo(30),
  },
];

/* --------------------------------- contacts -------------------------------- */

interface RawContact {
  name: string; business: string; category: string; city: string; area: string;
  source: string; campaignId: string | null; status?: Contact["status"]; tags?: string[];
  notes?: string;
}

const RAW_CONTACTS: RawContact[] = [
  { name: "محمود أحمد", business: "معرض النور للأجهزة الكهربائية", category: "أجهزة كهربائية", city: "الجيزة", area: "الهرم", source: "تكليف يدوي", campaignId: "cmp_1", tags: ["VIP", "مهتم"] },
  { name: "هدى عبد الرحمن", business: "صيدلية الشفاء", category: "صيدليات", city: "الجيزة", area: "أطفيح", source: "إكسل مستورد", campaignId: "cmp_1", tags: ["عميل جديد"] },
  { name: "مصطفى كامل", business: "مركز الصف للتدريب", category: "معاهد تدريب", city: "الجيزة", area: "الصف", source: "إكسل مستورد", campaignId: "cmp_1" },
  { name: "أحمد السيد", business: "كافيه ستارز", category: "مقاهي", city: "القاهرة", area: "مدينة نصر", source: "صفحة فيسبوك", campaignId: "cmp_1", tags: ["متابع"] },
  { name: "سارة منصور", business: "سوبر ماركت الأمل", category: "بقالة", city: "الجيزة", area: "فيصل", source: "تكليف يدوي", campaignId: "cmp_1" },
  { name: "عمرو فتحي", business: "ورشة النور لصيانة السيارات", category: "ورش سيارات", city: "القاهرة", area: "حلوان", source: "إكسل مستورد", campaignId: "cmp_1" },
  { name: "نهى مصطفى", business: "محل الأمانة للملابس", category: "ملابس", city: "القليوبية", area: "شبرا الخيمة", source: "توصية عميل", campaignId: "cmp_1" },
  { name: "خالد رمضان", business: "مطعم البيت الشامي", category: "مطاعم", city: "القاهرة", area: "المعادي", source: "صفحة فيسبوك", campaignId: "cmp_1", tags: ["VIP", "مرشح للإغلاق"] },
  { name: "ياسمين جمال", business: "صالون روبي للجمال", category: "تجميل وسبا", city: "الجيزة", area: "6 أكتوبر", source: "إكسل مستورد", campaignId: "cmp_1" },
  { name: "طارق حسن", business: "مكتبة المستقبل", category: "مكتبات وقرطاسية", city: "الشرقية", area: "الزقازيق", source: "تكليف يدوي", campaignId: "cmp_1" },
  { name: "سمير عبد العال", business: "مطحن الحبوب", category: "أغذية", city: "القليوبية", area: "بنها", source: "إكسل مستورد", campaignId: "cmp_2" },
  { name: "ريم عبد الله", business: "مركز براعم لرياض الأطفال", category: "تعليم", city: "الجيزة", area: "الدقي", source: "توصية عميل", campaignId: "cmp_1", tags: ["VIP"] },
  { name: "وليد قنديل", business: "تصوير قنديل", category: "خدمات تصوير", city: "القاهرة", area: "وسط البلد", source: "صفحة فيسبوك", campaignId: "cmp_1" },
  { name: "دينا سمير", business: "عيادة د. دينا لطب الأسنان", category: "عيادات", city: "القاهرة", area: "المهندسين", source: "تكليف يدوي", campaignId: "cmp_4", tags: ["عميل حالي"] },
  { name: "حسام عزت", business: "الرحاب للتكييفات والتبريد", category: "تكييفات", city: "القاهرة", area: "التجمع الخامس", source: "إكسل مستورد", campaignId: "cmp_1" },
  { name: "ماجد بدر", business: "مخبز بدر", category: "مخابز", city: "القاهرة", area: "العباسية", source: "إكسل مستورد", campaignId: "cmp_2" },
  { name: "إيمان فوزي", business: "محل روز للفساتين", category: "فساتين", city: "الجيزة", area: "الدقي", source: "توصية عميل", campaignId: "cmp_1" },
  { name: "أيمن شعبان", business: "كشكول للقرطاسية المدرسية", category: "قرطاسية", city: "الدقهلية", area: "المنصورة", source: "إكسل مستورد", campaignId: "cmp_1", status: "wrong_number" },
  { name: "غادة صلاح", business: "مركز نسمة للسبا والمساج", category: "تجميل وسبا", city: "الإسكندرية", area: "سموحة", source: "صفحة فيسبوك", campaignId: "cmp_1", status: "dnd", notes: "طلبت صاحبة المركز عدم الاتصال مرة أخرى بعد مكالمة 12 فبراير — ممنوع إضافتها لأي حملة." },
  { name: "فادي ناصر", business: "إنترناشيونال موتورز", category: "سيارات", city: "الجيزة", area: "الشيخ زايد", source: "تكليف يدوي", campaignId: "cmp_1", tags: ["مرشح للإغلاق"] },
  { name: "عبير حسين", business: "محل البركة للعطور", category: "عطور", city: "الغربية", area: "طنطا", source: "إكسل مستورد", campaignId: "cmp_2" },
  { name: "شريف لطفي", business: "ستوديو الفن للتصوير", category: "خدمات تصوير", city: "أسوان", area: "وسط المدينة", source: "إكسل مستورد", campaignId: "cmp_1" },
  { name: "منى عادل", business: "بيت الحلويات الشرقي", category: "حلويات", city: "البحيرة", area: "دمنهور", source: "توصية عميل", campaignId: "cmp_2" },
  { name: "كريم وجيه", business: "كافيه الجيم الرياضي", category: "مقاهي", city: "بورسعيد", area: "المنطقة الحرة", source: "صفحة فيسبوك", campaignId: "cmp_1" },
];

export function makeDemoContacts(): Contact[] {
  return RAW_CONTACTS.map((c, i) => {
    const n = String(i + 1).padStart(3, "0");
    return {
      id: `cnt_${i + 1}`,
      name: c.name,
      phone: `010000000${n}`.slice(0, 11),
      business: c.business,
      category: c.category,
      city: c.city,
      area: c.area,
      source: c.source,
      status: c.status ?? "active",
      tags: c.tags ?? [],
      campaignId: c.campaignId,
      lastCallAt: i % 3 === 0 ? hoursAgo(randInt(4, 96)) : i % 3 === 1 ? daysAgo(randInt(2, 12), randInt(10, 18)) : null,
      nextFollowUpAt: null,
      notes: c.notes ?? "",
      createdAt: daysAgo(randInt(3, 28)),
    };
  });
}

/* ------------------------------- transcript scripts ------------------------ */

type RawLine = [TranscriptLine["speaker"], string];

const T = (raw: RawLine[], startSec = 4, stepAgent = 5, stepCustomer = 6): TranscriptLine[] => {
  let t = startSec;
  return raw.map(([speaker, text]) => {
    const line: TranscriptLine = {
      id: uid("tl"),
      speaker,
      text,
      atSec: t,
    };
    t += speaker === "agent" ? stepAgent : stepCustomer;
    return line;
  });
};

export const SCRIPT_INTERESTED: RawLine[] = [
  ["agent", "مساء الخير يا فندم، معاك نور من فريق Voxora AI. حابب أتأكد إنني بتكلم صاحب معرض النور للأجهزة الكهربائية؟"],
  ["customer", "أهلاً بيك، أيوة أنا صاحب المعرض. مينكم؟"],
  ["agent", "تحت أمرك يا فندم. إحنا بنوفر موظف ذكاء اصطناعي بيرد على تليفونات نشاطكم 24 ساعة، يسجل الطلبات، ويحجز المواعيد بدون ما يفوتك أي عميل."],
  ["customer", "بصرة، دي فكرة حلوة. إحنا بنضيع مكالمات كتير وقت الزحمة."],
  ["agent", "بالظبط يا فندم، معظم أصحاب المعارض بيفقدوا 30% من المكالمات في أوقات الذروة. خدمتنا بتضمن رد فوري بأي وقت. تحب أشرحلك الباقات؟"],
  ["customer", "ماشي، احكيلي على الأسعار."],
  ["agent", "الباقة الأساسية 999 جنيه شهريًا وتشمل 500 دقيقة مكالمات وإعداد كامل للإيجنت على بيانات نشاطكم، ولوحة تحكم تتابع منها كل حاجة."],
  ["customer", "السعر معقول. هقى ممكن تبعتلي العرض على الواتساب وأرجع أرد عليك؟"],
  ["agent", "حاضر جدًا يا فندم، هسجل رقمك وأرسل العرض الكامل النهارده قبل 6 المساء. شكرًا لوقتك معايا."],
];

export const SCRIPT_CALLBACK: RawLine[] = [
  ["agent", "مساء الخير يا فندم، معاك نور من Voxora AI. وقت مناسب نتكلم؟"],
  ["customer", "أسف يا فندم أنا مشغول شوية دلوقتي، عندي زباين في الصيدلية."],
  ["agent", "متقلقش يا فندم، أقدر أسجل موعد اتصال بعد شوية. الساعة 5 عصرًا مناسبة؟"],
  ["customer", "الأفضل بكرة الصبح بعد 10."],
  ["agent", "تمام يا فندم، سجلت موعد بكرة 10:30 صباحًا. هنكلمك على نفس الرقم. شكرًا لوقتك."],
];

export const SCRIPT_NOT_INTERESTED: RawLine[] = [
  ["agent", "مساء الخير يا فندم، معاك نور من فريق Voxora AI بخصوص خدمة الموظف الذكي للمكالمات."],
  ["customer", "أوه، مش مهتم والله، إحنا عندنا موظفين بيردوا أصلاً."],
  ["agent", "من حقك طبعًا يا فندم. بس خليني أفهم: المشكلة في السعر ولا الخدمة نفسها مش مناسبة لنشاطكم؟"],
  ["customer", "لا الموضوع مش سعر، ببساطة مش محتاجينها حاليًا."],
  ["agent", "تمام يا فندم، سجلت ملاحظة إنها مش مناسبة حاليًا. لو تغيرت الظروف نقدر نتكلم تاني في أي وقت. شكرًا لوقتك."],
];

export const SCRIPT_TRANSFERRED: RawLine[] = [
  ["agent", "مساء الخير يا فندم، معاك نور من Voxora AI. حابب أتأكد إنني بتكلم مدير مطعم البيت الشامي؟"],
  ["customer", "أيوة أنا المدير. اتفضل."],
  ["agent", "خدمتنا بتفعّل موظف ذكاء اصطناعي يستقبل طلبات المطعم ويعمل تأكيد الحجوزات تلقائيًا، وممكن يشتغل مع أنظمة الكاشير."],
  ["customer", "دي الحاجة اللي بتدور عليها من فترة. بكم الباقة الكاملة؟ وينفع نركبها الأسبوع الجاي؟"],
  ["agent", "الباقة الكاملة 1999 جنيه شهريًا والتركيب بياخد 48 ساعة بس يا فندم. حسّك مهتم جدًا — هحولك حالًا لمسؤول المبيعات ليكمل التفاصيل معاك."],
  ["customer", "تمام، حولني عليه."],
  ["system", "تم تحويل المكالمة لموظف المبيعات: 01000000090"],
];

export const SCRIPT_INFO: RawLine[] = [
  ["agent", "صباح الخير، Voxora AI، معاك نور. أقدر أساعدك بإيه يا فندم؟"],
  ["customer", "أنا دكتورة دينا، عايزة أغير وقت الحجوزات من الساعتها؟ ولازم أنادي حد؟"],
  ["agent", "أقدر أعملها لحضرتك فورًا يا فندم من لوحة التحكم، وهشرحلك خطوة بخطوة. أأكدلك إن التغيير شغال بالتزامن مع صفحة الحجز؟"],
  ["customer", "أيوة اتأكدت، مشي الحال. شكرًا ليك."],
  ["agent", "العفو يا فندم، تحت أمرك في أي وقت."],
];

export const SCRIPT_SALE: RawLine[] = [
  ["agent", "مساء الخير يا فندم، معاك نور من Voxora AI بخصوص تجديد اشتراك مركز براعم."],
  ["customer", "أهلاً نور، إحنا مستخدمين الخدمة من 6 شهور وراضيين عنها جدًا."],
  ["agent", "ده شرف لينا يا فندم. اشتراكك بينتهي بعد 9 أيام — تحب نجدد نفس الباقة أم ترقي لباولة الأعمال بـ 1999 جنيه وتشمل مكالمات غير محدودة؟"],
  ["customer", "نرقي للأعمال، وقولهم يضيفوا رقم تاني للعيادة الثانية."],
  ["agent", "تم يا فندم، سجلت ترقية لباولة الأعمال برقم إضافي، والفاتورة هتوصلك على الميل. شكرًا لثقتكم."],
];

/* ---------------------------------- calls ---------------------------------- */

const OBJECTIONS = ["السعر مرتفع", "عندنا موظفين بالفعل", "مش مهتم حاليًا", "الخدمة غير مناسبة لنشاطنا", "الميزانية غير متاحة", "يريد التفكير"];

interface OutcomeProps {
  duration: number; score: number; sentiment: Call["sentiment"];
  summary: string; aiNotes: string; followUpAction: string; extracted: string[];
  objection?: string;
}

function propsFor(outcome: Call["outcome"], contactName: string, business: string): OutcomeProps {
  switch (outcome) {
    case "interested":
      return {
        duration: randInt(120, 300),
        score: randInt(68, 90),
        sentiment: "positive",
        summary: `أبدى ${contactName} صاحب «${business}» اهتمامًا واضحًا بخدمة الموظف الذكي وطلب استلام العرض التفصيلي على الواتساب.`,
        aiNotes: "عميل مؤهل — اهتمام حقيقي بالمشكلة (فقدان مكالمات الذروة). طلب العرض على الواتساب. الحساسية للسعر منخفضة. يفضل الاتصال بعد 48 ساعة للتأكيد.",
        followUpAction: "إرسال عرض السعر على الواتساب ثم اتصال تأكيدي بعد 48 ساعة",
        extracted: ["صاحب النشاط هو من قرر", "ي فقد مكالمات وقت الذروة", "طلب العرض على الواتساب", "الميزانية متاحة"],
      };
    case "callback":
      return {
        duration: randInt(50, 100),
        score: randInt(45, 65),
        sentiment: "neutral",
        summary: `${contactName} كان مشغولًا وقت المكالمة وطلب إعادة الاتصال في وقت لاحق مناسب.`,
        aiNotes: "العميل ليس رافضًا — فقط مشغول. تم تحديد موعد اتصال لاحق بناءً على طلبه.",
        followUpAction: "اتصال مجدول في الموعد الذي حدده العميل",
        extracted: ["العميل مشغول حاليًا", "طلب اتصال في وقت محدد"],
      };
    case "not_interested":
      return {
        duration: randInt(90, 200),
        score: randInt(12, 35),
        sentiment: "negative",
        summary: `${contactName} صاحب «${business}» ليس مهتمًا بالخدمة حاليًا.`,
        aiNotes: "رفض هادئ بدون عدائية. سُجل سبب الاعتراض ويُنصح بإعادة المحاولة بعد 3 شهور فقط.",
        followUpAction: "إعادة المحاولة بعد 90 يومًا",
        extracted: ["سبب الرفض: ليس محتاجًا حاليًا"],
        objection: pick(OBJECTIONS),
      };
    case "transferred":
      return {
        duration: randInt(280, 480),
        score: randInt(85, 97),
        sentiment: "positive",
        summary: `${contactName} صاحب «${business}» مهتم جدًا وطلب التحدث مع مسؤول مبيعات فورًا — تم تحويل المكالمة بنجاح.`,
        aiNotes: "عميل ساخن (Hot Lead). جاهز لاتخاذ قرار خلال أيام. تم التحويل لموظف المبيعات أثناء المكالمة.",
        followUpAction: "متابعة موظف المبيعات خلال 24 ساعة لإغلاق الصفقة",
        extracted: ["طلب التحدث مع مبيعات", "جاهز للتركيب هذا الأسبوع", "سأل عن الباقة الكاملة"],
      };
    case "sale":
      return {
        duration: randInt(300, 500),
        score: randInt(90, 99),
        sentiment: "positive",
        summary: `تم إتمام عملية تجديد وترقية الاشتراك مع ${contactName} بنجاح أثناء المكالمة.`,
        aiNotes: "صفقة مغلقة — عميل راضٍ اختار الترقية وطلب رقمًا إضافيًا. فرصة بيع إضافي مستقبلًا (فروع جديدة).",
        followUpAction: "متابعة ما بعد البيع بعد 7 أيام للتأكد من التركيب",
        extracted: ["تم اختيار باقة الأعمال", "طلب رقم إضافي", "العميل راضٍ عن الخدمة"],
      };
    case "info":
      return {
        duration: randInt(100, 240),
        score: randInt(30, 50),
        sentiment: "neutral",
        summary: `استفسار من ${contactName} تم الرد عليه بالكامل من قاعدة المعرفة دون الحاجة لموظف بشري.`,
        aiNotes: "استفسار تشغيلي بسيط. تم حل المشكلة من أول مكالمة — لا حاجة لمتابعة.",
        followUpAction: "لا يلزم متابعة",
        extracted: ["الاستفسار تم حله من قاعدة المعرفة"],
      };
    default:
      return {
        duration: 0,
        score: 0,
        sentiment: "neutral",
        summary: "لم يتم إتمام الاتصال بالعميل.",
        aiNotes: "المكالمة لم يتم الرد عليها — سيتم إعادة المحاولة حسب سياسة الحملة.",
        followUpAction: "إعادة محاولة تلقائية",
        extracted: [],
      };
  }
}

type BuildCallOpts = Partial<Call> & {
  outcome: Call["outcome"];
  startedAt: string;
  direction?: Call["direction"];
  campaignId?: string | null;
};

function buildCall(id: string, contact: Contact, opts: BuildCallOpts, transcript?: TranscriptLine[] | null): Call {
  const p = propsFor(opts.outcome, contact.name, contact.business);
  const answered = opts.status ? opts.status === "answered" : true;
  const script =
    opts.outcome === "interested" ? SCRIPT_INTERESTED
    : opts.outcome === "callback" ? SCRIPT_CALLBACK
    : opts.outcome === "not_interested" ? SCRIPT_NOT_INTERESTED
    : opts.outcome === "transferred" ? SCRIPT_TRANSFERRED
    : opts.outcome === "sale" ? SCRIPT_SALE
    : SCRIPT_INFO;
  return {
    id,
    contactId: contact.id,
    contactName: contact.name,
    phone: contact.phone,
    direction: opts.direction ?? "outbound",
    campaignId: opts.campaignId ?? contact.campaignId,
    agentId: "agent_1",
    startedAt: opts.startedAt,
    durationSec: answered ? p.duration : 0,
    status: opts.status ?? "answered",
    outcome: answered ? opts.outcome : "none",
    leadScore: answered ? p.score : 0,
    sentiment: answered ? p.sentiment : "neutral",
    summary: p.summary,
    aiNotes: p.aiNotes,
    followUpAction: p.followUpAction,
    extracted: p.extracted,
    transcript: answered && transcript !== null ? T(script) : [],
    recordingStatus: answered ? "pending" : "unavailable",
    objection: p.objection,
    ...Object.fromEntries(Object.entries(opts).filter(([k]) => !["outcome", "startedAt", "direction", "campaignId", "status", "transcript"].includes(k))),
  } as Call;
}

/** Curated, high-quality calls shown on the dashboard for today/yesterday. */
function makeCuratedCalls(contacts: Contact[]): Call[] {
  const byName = (n: string) => contacts.find((c) => c.name === n)!;
  return [
    buildCall("call_1", byName("محمود أحمد"), { outcome: "interested", startedAt: hoursAgo(1.2) }),
    buildCall("call_2", byName("هدى عبد الرحمن"), { outcome: "callback", startedAt: hoursAgo(2.5) }),
    buildCall("call_3", byName("خالد رمضان"), { outcome: "transferred", startedAt: hoursAgo(4), campaignId: "cmp_1" }),
    buildCall("call_4", byName("طارق حسن"), { outcome: "not_interested", startedAt: hoursAgo(6) }),
    buildCall("call_5", byName("سارة منصور"), { outcome: "none", status: "no_answer", startedAt: hoursAgo(7) }),
    buildCall("call_6", byName("عمرو فتحي"), { outcome: "none", status: "busy", startedAt: hoursAgo(8) }),
    buildCall("call_7", byName("أيمن شعبان"), { outcome: "none", status: "wrong_number", startedAt: hoursAgo(9), durationSec: 35 }),
    buildCall("call_8", byName("دينا سمير"), { outcome: "info", direction: "inbound", campaignId: "cmp_4", startedAt: hoursAgo(10.5) }),
    buildCall("call_9", byName("وليد قنديل"), { outcome: "interested", startedAt: hoursAgo(12) }),
    buildCall("call_10", byName("ريم عبد الله"), { outcome: "sale", startedAt: hoursAgo(13.5), campaignId: "cmp_2" }),
  ];
}

/** Bulk history for the last 30 days (deterministic). */
function makeHistoryCalls(contacts: Contact[], curatedCount: number): Call[] {
  const calls: Call[] = [];
  const pool = contacts.filter((c) => c.status !== "dnd" && c.status !== "wrong_number");
  let i = curatedCount;
  for (let d = 30; d >= 1; d--) {
    const n = randInt(3, 6);
    for (let k = 0; k < n; k++) {
      const contact = pick(pool);
      const stRoll = rand();
      const status: Call["status"] = stRoll < 0.62 ? "answered" : stRoll < 0.8 ? "no_answer" : stRoll < 0.92 ? "busy" : stRoll < 0.97 ? "wrong_number" : "failed";
      let outcome: Call["outcome"] = "none";
      if (status === "answered") {
        const oRoll = rand();
        outcome = oRoll < 0.4 ? "interested" : oRoll < 0.62 ? "callback" : oRoll < 0.8 ? "not_interested" : oRoll < 0.88 ? "transferred" : oRoll < 0.95 ? "info" : "sale";
      }
      const h = randInt(10, 18);
      calls.push(
        buildCall(
          `call_gen_${i++}`,
          contact,
          {
            outcome,
            status,
            startedAt: daysAgo(d, h),
            campaignId: rand() < 0.75 ? "cmp_1" : "cmp_2",
          },
          // Keep full transcripts only for a subset of historical calls.
          status === "answered" && rand() < 0.4 ? undefined : null
        )
      );
    }
  }
  return calls;
}

export function makeDemoCalls(contacts: Contact[]): Call[] {
  const curated = makeCuratedCalls(contacts);
  const history = makeHistoryCalls(contacts, curated.length + 1);
  return [...curated, ...history].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/* ---------------------------------- agent ---------------------------------- */

export const DEFAULT_AGENT: AgentConfig = {
  id: "agent_1",
  name: "نور",
  jobTitle: "موظف خدمة عملاء ومبيعات بالذكاء الاصطناعي",
  type: "sales",
  language: "ar_eg",
  personality: "friendly",
  voice: "salma_ar_eg",
  greeting: "مساء الخير يا فندم، معاك نور من فريق Voxora AI. مع مين بشرف حضرتك؟",
  closing: "شكرًا لوقتك يا فندم، تحت أمرك في أي وقت. يوم سعيد.",
  objectionHandling:
    "عند الاعتراض على السعر: أوضح القيمة (فقدان المكالمات = فقدان عملاء) ثم اعرض الباقة الأساسية. عند الاعتراض «عندنا موظفين»: وضح أن الخدمة لتغطية أوقات الذروة والإجازات وليست بديلًا. عند طلب التفكير: اطلب إرسال العرض على الواتساب وحدد موعد اتصال.",
  transferWhen:
    "حوّل المكالمة لموظف بشري إذا: طلب العميل التحدث مع شخص حقيقي، تجاوزت درجة الجاهزية 80 مع نية شراء واضحة، أو انزعج العميل أو طلب إيقاف الخدمة.",
  maxDurationMin: 8,
  collectInfo: ["اسم صاحب النشاط", "نوع النشاط التجاري", "رقم واتساب للتواصل", "موعد اتصال مناسب", "الباقة المطلوبة"],
  neverSay: [
    "لا تدّعِ أبدًا أنك إنسان أو موظف حقيقي",
    "لا تذكر أسعارًا غير موجودة في قاعدة المعرفة",
    "لا تعد بخصومات أو عروض غير معتمدة",
    "لا تشارك بيانات أو معلومات عملاء آخرين",
    "لا تستخدم عبارات جارحة أو ساخرة مهما كان رد العميل",
  ],
  systemPrompt: `أنت "نور"، موظف خدمة العملاء والمبيعات الصوتي الخاص بشركة Voxora AI.
تتحدث باللهجة المصرية البسيطة والمهذبة، بصوت أنثوي هادئ.

مهمتك في هذه المكالمة:
1. عرّف بنفسك باسم نور من Voxora AI وتأكد أنك تتكلم مع صاحب القرار.
2. اشرح الخدمة في جملتين: موظف ذكاء اصطناعي يرد على مكالمات النشاط 24 ساعة، يسجل الطلبات، ويحجز المواعيد.
3. اسأل عن اهتمامه، واستمع للرد كاملًا قبل الرد.
4. إن كان مهتمًا: اشرح الباقات من قاعدة المعرفة، واعرض إرسال العرض على الواتساب.
5. إن كان مشغولًا: حدد موعد اتصال لاحق.
6. إن طلب موظفًا حقيقيًا أو كان جاهزًا للشراء: حوّل المكالمة فورًا.

قواعد إلزامية:
- لا تتكلم أكثر من 3 جمل متتالية، ودع العميل يتكلم.
- لا تختلق معلومات أو أسعار — اعتمد فقط على قاعدة المعرفة.
- إذا طلب العميل عدم الاتصال مرة أخرى: سجّل الطلب واعتذر بلطف وأنهِ المكالمة.
- أخيرًا: اختتم بلطف مهما كانت النتيجة.`,
  flow: [
    { id: "fs_1", kind: "start", title: "بداية المكالمة", prompt: "افتح المكالمة برسالة الافتتاح وتأكد من وصولك للشخص الصحيح." },
    { id: "fs_2", kind: "question", title: "تأكيد هوية صاحب النشاط", prompt: "هل أنت صاحب/مسؤول {اسم النشاط}؟ إذا لم يكن صاحب النشاط: سجّل الرقم كرقم غير صحيح واختم بلطف." },
    { id: "fs_3", kind: "message", title: "شرح سبب الاتصال", prompt: "اشرح الخدمة في جملتين مع ذكر فائدة مباشرة لنشاط العميل." },
    { id: "fs_4", kind: "condition", title: "هل العميل مهتم؟", conditions: [
      { id: "fc_1", when: "أبدى اهتمامًا وطلب التفاصيل", then: "انتقل إلى شرح العرض والباقات" },
      { id: "fc_2", when: "قال إنه مشغول", then: "حدد موعد اتصال لاحق وسجله في المتابعة" },
      { id: "fc_3", when: "قال إنه غير مهتم", then: "اسأل عن السبب بلطف ثم انتقل للتعامل مع الاعتراض" },
      { id: "fc_4", when: "الرقم ليس لصاحب النشاط", then: "سجّل الرقم كرقم غير صحيح وأنهِ المكالمة" },
    ] },
    { id: "fs_5", kind: "message", title: "شرح العرض والباقات", prompt: "اعرض الباقة المناسبة من قاعدة المعرفة واطلب إرسال العرض على الواتساب." },
    { id: "fs_6", kind: "condition", title: "التعامل مع الاعتراض", conditions: [
      { id: "fc_5", when: "اعترض على السعر", then: "أوضح القيمة ثم اعرض الباقة الأساسية" },
      { id: "fc_6", when: "عنده موظفين", then: "وضح أن الخدمة تغطي أوقات الذروة والإجازات" },
      { id: "fc_7", when: "طلب موظفًا حقيقيًا", then: "حوّل المكالمة فورًا لموظف المبيعات" },
    ] },
    { id: "fs_7", kind: "condition", title: "التأهيل النهائي", conditions: [
      { id: "fc_8", when: "مهتم + جاهز للشراء الآن", then: "حوّل لموظف المبيعات فورًا" },
      { id: "fc_9", when: "مهتم + يحتاج وقت", then: "سجّل متابعة بعد 48 ساعة" },
      { id: "fc_10", when: "غير مهتم نهائيًا", then: "اختم بلطف وسجّل سبب الرفض" },
    ] },
    { id: "fs_8", kind: "end", title: "الختام", prompt: "اختتم برسالة الختام بغض النظر عن النتيجة وسجّل نتيجة المكالمة." },
  ],
};

/* ----------------------------------- leads ---------------------------------- */

export function makeDemoLeads(contacts: Contact[]): Lead[] {
  const defs: Array<[string, Lead["stage"], number, string]> = [
    ["خالد رمضان", "ready_to_close", 92, "إغلاق الصفقة — متابعة موظف المبيعات"],
    ["ريم عبد الله", "won", 95, "متابعة ما بعد البيع بعد 7 أيام"],
    ["محمود أحمد", "interested", 86, "إرسال العرض واتصال تأكيدي بعد 48 ساعة"],
    ["وليد قنديل", "interested", 74, "إرسال العرض على الواتساب"],
    ["فادي ناصر", "ready_to_close", 88, "اتصال من موظف المبيعات"],
    ["هدى عبد الرحمن", "followup", 58, "اتصال مجدول صباحًا"],
    ["أحمد السيد", "followup", 52, "تجربة مجانية أسبوع"],
    ["دينا سمير", "won", 81, "لا يلزم — عميل حالي"],
    ["حسام عزت", "contacted", 44, "محاولة اتصال ثانية"],
    ["إيمان فوزي", "contacted", 40, "محاولة اتصال ثانية"],
    ["ياسمين جمال", "new", 20, "أول اتصال تعريفي"],
    ["كريم وجيه", "new", 15, "أول اتصال تعريفي"],
    ["طارق حسن", "lost", 22, "إعادة محاولة بعد 90 يومًا"],
  ];
  return defs.map(([name, stage, score, nextAction], i) => {
    const c = contacts.find((x) => x.name === name)!;
    return {
      id: `lead_${i + 1}`,
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      business: c.business,
      stage,
      score,
      lastCallAt: stage === "new" ? null : hoursAgo(randInt(2, 200)),
      nextAction,
      campaignId: c.campaignId,
    };
  });
}

/* -------------------------------- follow-ups -------------------------------- */

export function makeDemoFollowUps(contacts: Contact[]): FollowUp[] {
  const defs: Array<[string, string, string | number, FollowUp["status"]]> = [
    ["هدى عبد الرحمن", "موعد اتصال حدده العميل — مشغولة وقت المكالمة الأولى", hoursAgo(-2), "pending"],
    ["أحمد السيد", "تجربة مجانية — تأكيد الرضا", hoursAgo(-5), "pending"],
    ["مصطفى كامل", "إعادة محاولة بعد عدم الرد", hoursAgo(3), "pending"],
    ["سمير عبد العال", "إعادة محاولة بعد عدم الرد", hoursAgo(26), "pending"],
    ["محمود أحمد", "تأكيد استلام عرض السعر على الواتساب", inDays(2, 12), "pending"],
    ["وليد قنديل", "إرسال العرض ومناقشة الباقة", inDays(1, 15), "pending"],
    ["إيمان فوزي", "محاولة اتصال ثانية", inDays(3, 11), "pending"],
    ["دينا سمير", "استفسار عن الترقية للرقم الثاني", inDays(6, 13), "pending"],
  ];
  return defs.map(([name, reason, due, status], i) => {
    const c = contacts.find((x) => x.name === name)!;
    return {
      id: `fu_${i + 1}`,
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      reason,
      dueAt: typeof due === "number" && due > 1e12 ? new Date(due).toISOString() : String(due),
      campaignId: c.campaignId,
      status,
      callId: i === 0 ? "call_2" : null,
    };
  });
}

/* -------------------------------- call queue -------------------------------- */

export function makeDemoQueue(contacts: Contact[]): QueueItem[] {
  const names = ["حسام عزت", "إيمان فوزي", "ياسمين جمال", "كريم وجيه", "شريف لطفي", "منى عادل", "عبير حسين", "نهى مصطفى"];
  const priorities: QueueItem["priority"][] = ["high", "normal", "normal", "high", "normal", "low", "normal", "normal"];
  return names.map((name, i) => {
    const c = contacts.find((x) => x.name === name)!;
    return {
      id: `q_${i + 1}`,
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      campaignId: i < 5 ? "cmp_1" : "cmp_2",
      attempts: i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 2,
      priority: priorities[i],
      scheduledAt: hoursAgo(-(i + 1) * 0.6),
      status: "waiting",
    };
  });
}

/* ------------------------------- knowledge base ----------------------------- */

export function makeDemoKB(): KBItem[] {
  return [
    {
      id: "kb_1",
      title: "عن شركة Voxora AI",
      category: "عن الشركة",
      type: "text",
      content:
        "Voxora AI شركة مصرية متخصصة في بناء موظفي مكالمات بالذكاء الاصطناعي للأنشطة التجارية الصغيرة والمتوسطة.\n\nالخدمة الأساسية: موظف ذكاء اصطناعي صوتي يرد على مكالمات النشاط 24/7، يتحدث العربية بطلاقة، يسجل الطلبات، يحجز المواعيد، ويحول العملاء الجاهزين لموظفي المبيعات.\n\nالتأسيس: 2024 — القاهرة.\nعملاؤنا الحاليون: أكثر من 120 نشاطًا تجاريًا (صيدليات، مطاعم، معارض، عيادات).",
      faq: [],
      fileName: null,
      tags: ["الشركة", "تعريف"],
      updatedAt: daysAgo(12),
      active: true,
    },
    {
      id: "kb_2",
      title: "الباقات والأسعار",
      category: "الأسعار والباقات",
      type: "text",
      content:
        "الباقة الأساسية — 999 جنيه شهريًا:\n- 500 دقيقة مكالمات\n- إعداد كامل للإيجنت على بيانات النشاط\n- لوحة تحكم كاملة + تسجيلات المكالمات\n\nباقة الأعمال — 1,999 جنيه شهريًا:\n- مكالمات غير محدودة\n- رقمين في نفس الوقت\n- تقارير أداء أسبوعية\n\nباقة المؤسسات — 3,999 جنيه شهريًا:\n- حتى 5 أرقام متزامنة\n- تكامل مع أنظمة الحجز والكاشير\n- مدير حساب مخصص\n\nملاحظة: جميع الباقات تشمل إعداد التدفق وقاعدة المعرفة مجانًا. لا يوجد عقد التزام — الاشتراك شهري.",
      faq: [],
      fileName: null,
      tags: ["الأسعار", "الباقات"],
      updatedAt: daysAgo(8),
      active: true,
    },
    {
      id: "kb_3",
      title: "خطوات التسجيل وتفعيل الخدمة",
      category: "التسجيل",
      type: "text",
      content:
        "1. تسجيل حساب على الموقع وتأكيد رقم الهاتف.\n2. رفع قائمة العملاء (CSV / Excel) أو ربط قاعدة بياناتك.\n3. مكالمة إعداد مع فريق النجاح (15 دقيقة) لتحديد أهداف الإيجنت.\n4. تجهيز قاعدة المعرفة والنصوص.\n5. فترة تجريبية 7 أيام على 20 مكالمة.\n6. التفعيل الكامل بعد الموافقة.\n\nمدة التجهيز الكاملة: 48 ساعة كحد أقصى.",
      faq: [],
      fileName: null,
      tags: ["التسجيل", "الإعداد"],
      updatedAt: daysAgo(20),
      active: true,
    },
    {
      id: "kb_4",
      title: "سياسة الاسترجاع والإلغاء",
      category: "السياسات",
      type: "text",
      content:
        "الإلغاء: يمكن إلغاء الاشتراك في أي وقت من لوحة التحكم، ويستمر الخدمة حتى نهاية الدورة المدفوعة.\n\nالاسترجاع: استرجاع كامل خلال أول 7 أيام إذا لم تتجاوز الاستخدام 50 دقيقة.\n\nحماية البيانات: تسجيلات المكالمات ملك حصري للعميل وتُحذف نهائيًا عند الطلب أو بعد 30 يومًا حسب الإعداد.\n\nعدم الاتصال: أي عميل يطلب عدم الاتصال يُحجب نهائيًا من جميع الحملات.",
      faq: [],
      fileName: null,
      tags: ["السياسات"],
      updatedAt: daysAgo(15),
      active: true,
    },
    {
      id: "kb_5",
      title: "أسئلة شائعة عن الخدمة",
      category: "أسئلة شائعة",
      type: "faq",
      content: "",
      faq: [
        { id: "fq_1", q: "هل الموظف الذكي بيتكلم عربي كويس؟", a: "أيوه، الإيجنت بيتكلم عربي فصيح وباللهجة المصرية أو الخليجية حسب اختيارك، وبفهم كلام العميل الطبيعي بدون تعقيد." },
        { id: "fq_2", q: "هي المكالمات بتبقى حقيقية ولا تسجيلات؟", a: "المكالمات حقيقية ومباشرة — العميل بيسمع صوت طبيعي وبيرد عليه فورًا، وكل مكالمة بتتسجل ومحتواها بيتحفظ في لوحة التحكم." },
        { id: "fq_3", q: "ينفع الإيجنت يحول مكالمة لموظف حقيقي؟", a: "أيوه، لما العميل يبقى جاهز للشراء أو يطلب التحدث مع شخص، الإيجنت بيحول المكالمة فورًا لموظف المبيعات على رقمك." },
        { id: "fq_4", q: "محتاج أجهزة أو خطوط جديدة؟", a: "لأ، بنشتغل على أرقامك الحالية ونتكفل بإعداد التحويل كاملًا بدون أي أجهزة إضافية." },
      ],
      fileName: null,
      tags: ["أسئلة", "عام"],
      updatedAt: daysAgo(5),
      active: true,
    },
    {
      id: "kb_6",
      title: "الخدمات الجديدة — 2025",
      category: "المنتجات",
      type: "text",
      content:
        "1. المكالمات الواردة الذكية: استقبال مكالمات العملاء والرد على الاستفسارات تلقائيًا (متاح).\n2. تأكيد الحجوزات التلقائي: اتصال يوم العميل بتأكيد الموعد (متاح قريبًا — أبريل).\n3. تكامل واتساب: إرسال العروض والفواتير بعد المكالمة (متاح قريبًا).\n4. تعدد الفروع: إيجنت منفصل لكل فرع بتدفق مختلف (تحت التطوير).",
      faq: [],
      fileName: null,
      tags: ["جديد", "المنتجات"],
      updatedAt: daysAgo(2),
      active: true,
    },
  ];
}

/* --------------------------------- settings --------------------------------- */

export const DEFAULT_SETTINGS: AppSettings = {
  general: { appName: "Voxora AI", timezone: "Africa/Cairo" },
  telephony: {
    provider: "mock",
    backendUrl: "",
    wsUrl: "ws://localhost:8080/media",
    apiUrl: "http://asterisk.local:8088/ari",
    apiSecret: "",
    statusEndpoint: "/agent/status",
    callEndpoint: "/channels/originate",
    hangupEndpoint: "/channels/{id}/hangup",
    transferEndpoint: "/channels/{id}/transfer",
  },
  aiModels: {
    provider: "ollama",
    baseUrl: "http://localhost:11434",
    model: "qwen3:4b",
    temperature: 0.4,
    maxTokens: 512,
  },
  stt: { provider: "whisper_cpp", baseUrl: "http://localhost:8090", model: "medium", language: "ar-EG" },
  tts: { provider: "local", baseUrl: "http://localhost:8091", voice: "ar_JO-kareem-medium", speed: 1.0 },
  database: { supabaseUrl: "https://your-project.supabase.co", supabaseAnonKey: "" },
  transfer: {
    supportPhone: "01000000080",
    salesPhone: "01000000090",
    fallbackPhone: "01000000099",
    rules: [
      { id: "tr_1", condition: "درجة الجاهزية أعلى من 80 + نية شراء واضحة", destination: "sales" },
      { id: "tr_2", condition: "العميل يطلب التحدث مع موظف حقيقي", destination: "support" },
      { id: "tr_3", condition: "شكوى أو انزعاج من الخدمة", destination: "support" },
    ],
  },
  security: { sessionTimeoutMin: 60, require2fa: false },
  notifications: { onCallCompleted: true, onLeadTransferred: true, onFollowUpDue: true, dailySummary: false },
};

/* ------------------------- simulation scripts (mock) ------------------------ */

/** Used by the MockTelephonyProvider to stream a live simulated conversation. */
export interface SimScript {
  lines: TranscriptLine[];
  outcome: Call["outcome"];
  status: Call["status"];
  sentiment: Call["sentiment"];
  score: number;
  summary: string;
  aiNotes: string;
  followUpAction: string;
  extracted: string[];
  objection?: string;
}

export function simScriptFor(outcome: Call["outcome"]): SimScript {
  const raw =
    outcome === "interested" ? SCRIPT_INTERESTED
    : outcome === "callback" ? SCRIPT_CALLBACK
    : outcome === "not_interested" ? SCRIPT_NOT_INTERESTED
    : outcome === "transferred" ? SCRIPT_TRANSFERRED
    : outcome === "sale" ? SCRIPT_SALE
    : SCRIPT_INFO;
  const props = propsFor(outcome, "{name}", "{business}");
  return {
    lines: T(raw),
    outcome,
    status: "answered",
    sentiment: props.sentiment,
    score: props.score,
    summary: props.summary,
    aiNotes: props.aiNotes,
    followUpAction: props.followUpAction,
    extracted: props.extracted,
    objection: props.objection,
  };
}
