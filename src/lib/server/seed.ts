/**
 * Voxora AI — first-run demo seeding (Daleely tenant mirror, Egyptian-style data).
 * Runs lazily once when the ops tables are empty. All phone numbers are obviously
 * fake test numbers (010000000xx style). No real calls / no real WhatsApp.
 */
import { db } from "@/lib/db";
import { normalizePhone } from "./phone";
import { assignLeadFairly } from "./assignment";

let seeding: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (!seeding) seeding = doSeed().catch((e) => { seeding = null; throw e; });
  return seeding;
}

async function doSeed(): Promise<void> {
  const existing = await db.salesAgent.count();
  if (existing > 0) return;

  /* ------------------------------- Team ------------------------------- */
  const admin = await db.salesAgent.create({
    data: { name: "أحمد المصري", role: "admin", rawPhone: "01000000000", status: "active", canReceiveLeads: false },
  });
  const manager = await db.salesAgent.create({
    data: { name: "سارة محمود", role: "manager", rawPhone: "01000000077", status: "active", canReceiveLeads: true },
  });
  const agentA = await db.salesAgent.create({
    data: { name: "أحمد سمير", role: "sales", rawPhone: "01000000088", status: "active", canReceiveLeads: true },
  });
  const agentB = await db.salesAgent.create({
    data: { name: "محمود عادل", role: "sales", rawPhone: "01100000088", status: "active", canReceiveLeads: true },
  });
  const viewer = await db.salesAgent.create({
    data: { name: "منى فؤاد", role: "viewer", status: "active", canReceiveLeads: false },
  });
  // disabled employee with history (used to verify safe reassignment)
  const disabledAgent = await db.salesAgent.create({
    data: { name: "كريم شوقي", role: "sales", rawPhone: "01200000088", status: "disabled", canReceiveLeads: false },
  });
  void admin; void manager; void viewer;

  /* ------------------------------ Users ------------------------------- */
  const userSeed: [string, string, boolean][] = [
    ["محمود أحمد", "01000000001", true],
    ["هدى سمير", "01100000002", true],
    ["طارق الشاذلي", "01000000003", true],
    ["أميرة حسن", "01100000004", true],
    ["مصطفى كامل", "01200000005", true],
    ["نهى عادل", "01500000006", true],
    ["سعيد عبد الحميد", "01000000007", false],
    ["وليد قنديل", "01100000008", false],
    ["ربيع عبد الرحمن", "01000000009", false],
    ["ليان فؤاد", "01100000010", false],
    ["حسن عبده", "01200000011", false],
    ["سعاد فهمي", "01500000012", false],
  ];
  const users: Record<string, { id: string; fullName: string; normalizedPhone: string }> = {};
  for (const [name, phone, reg] of userSeed) {
    const n = normalizePhone(phone);
    const u = await db.opsUser.create({
      data: {
        fullName: name,
        rawPhone: phone,
        normalizedPhone: n.canonical,
        isRegistered: reg,
        email: reg ? `${name.replace(/\s/g, ".")}@daleely.example` : null,
      },
    });
    users[name] = { id: u.id, fullName: name, normalizedPhone: n.canonical };
  }

  /* ----------------------------- Listings ----------------------------- */
  type L = {
    name: string; phone: string; category: string; gov: string; city: string;
    village?: string; address?: string; desc?: string; whatsapp?: string;
    owner?: string; images?: string[]; social?: Record<string, string>;
    website?: string; hours?: string;
  };
  const listingSeed: L[] = [
    // قاهرة
    { name: "معرض النور للأجهزة الكهربائية", phone: "01000000020", category: "أجهزة كهربائية", gov: "القاهرة", city: "مدينة نصر", address: "شارع عباس العقاد", desc: "معرض أجهزة كهربائية وإلكترونيات بأسعار الجملة وضمان معتمد.", whatsapp: "01000000020", owner: "محمود أحمد", images: ["img-nour-1", "img-nour-2"], social: { facebook: "fb.com/alnour.electronics" }, hours: "يوميًا 10ص - 10م" },
    { name: "صيدلية الشفاء", phone: "01000000021", category: "صيدليات", gov: "القاهرة", city: "المعادي", address: "شارع 9، المعادي", desc: "صيدلية تعمل 24 ساعة مع خدمة توصيل الأدوية داخل المعادي.", whatsapp: "01000000021", hours: "24 ساعة" },
    { name: "مركز الصف للتعليم", phone: "01100000022", category: "تعليم ودروس", gov: "القاهرة", city: "حلوان", address: "شارع أبو سعد الحفني", desc: "مراكز تدريب ودروس خصوصية لجميع المراحل." },
    { name: "بوتيك سوسن للأزياء", phone: "01100000023", category: "أزياء وملابس", gov: "القاهرة", city: "مصر الجديدة", owner: "هدى سمير", whatsapp: "01100000023" },
    { name: "مطعم كشري التحرير", phone: "01200000024", category: "مطاعم", gov: "القاهرة", city: "التحرير" },
    { name: "مكتب الأمانة للعقارات", phone: "01000000025", category: "عقارات", gov: "القاهرة", city: "التجمع الخامس", owner: "طارق الشاذلي", desc: "بيع وشراء وتأجير العقارات بالتجمع والمحيط." },
    { name: "كافيه الزيتونة", phone: "01500000026", category: "مقاهي", gov: "القاهرة", city: "المقطم" },
    { name: "عيادة د. نهى لطب الأسنان", phone: "01000000027", category: "عيادات", gov: "القاهرة", city: "الزمالك", owner: "نهى عادل" },
    { name: "صيدلية الشفا فرع المعادي", phone: "01000000051", category: "صيدليات", gov: "القاهرة", city: "المعادي", address: "شارع 9، المعادي", desc: "فرع جديد بصيدلية الشفاء — توصيل الأدوية." }, // ديبليكيت اسم فقط (مراجعة يدوية)
    // جيزة / أطفيح
    { name: "مصنع أطفيح للبلاستيك", phone: "01100000030", category: "مصانع", gov: "الجيزة", city: "أطفيح", village: "البرشاء", address: "المنطقة الصناعية", desc: "إنتاج أكياس وأدوات بلاستيك للتجار بالجملة.", whatsapp: "01100000030", owner: "مصطفى كامل" },
    { name: "مركز الصف الطبي", phone: "01000000031", category: "عيادات", gov: "الجيزة", city: "الصف", address: "شارع المحطة" },
    { name: "مطعم بلدي الصف", phone: "01000000032", category: "مطاعم", gov: "الجيزة", city: "الصف" },
    { name: "محلات الهرم للأدوات المنزلية", phone: "01100000033", category: "أدوات منزلية", gov: "الجيزة", city: "الهرم", owner: "أميرة حسن" },
    { name: "شركة الفيصل للنقل السياحي", phone: "01200000034", category: "نقل وسياحة", gov: "الجيزة", city: "فيصل", desc: "أجرة حافلات وسيارات مع السائق داخل مصر." },
    { name: "مكتبة المستقبل", phone: "01500000035", category: "مكتبات", gov: "الجيزة", city: "الدقي" },
    // إسكندرية
    { name: "معرض سموحة للسيارات", phone: "01000000040", category: "سيارات", gov: "الإسكندرية", city: "سموحة", owner: "سعيد عبد الحميد" },
    { name: "شركة البحر للمقاولات", phone: "01100000041", category: "مقاولات", gov: "الإسكندرية", city: "العجمي" },
    { name: "كافيه سان ستيفانو", phone: "01200000042", category: "مقاهي", gov: "الإسكندرية", city: "سان ستيفانو", whatsapp: "01200000042" },
    { name: "مصنع الشرق للأثاث المعدني", phone: "01100000043", category: "مصانع", gov: "الإسكندرية", city: "برج العرب" },
    // شرقية / منيا
    { name: "معرض زقازيق للألبان", phone: "01000000044", category: "أغذية", gov: "الشرقية", city: "الزقازيق" },
    { name: "مكتب المنيا للشحن البري", phone: "01100000045", category: "شحن ونقل", gov: "المنيا", city: "المنيا", owner: "وليد قنديل" },
    { name: "حلويات بني سويف الملكية", phone: "01200000046", category: "حلويات", gov: "بني سويف", city: "بني سويف" },
    { name: "مزرعة الأمل للدواجن", phone: "01500000047", category: "زراعة ومزارع", gov: "المنيا", city: "مغاغة", village: "كروم الشرقاوي" },
    { name: "ورشة نجار طنطا الفنية", phone: "01000000048", category: "ورش وحرف", gov: "الغربية", city: "طنطا" },
    { name: "صيدلية النور - المنصورة", phone: "01100000049", category: "صيدليات", gov: "الدقهلية", city: "المنصورة", owner: "ربيع عبد الرحمن" },
    { name: "شركة ليان للمكاتب والتجهيزات", phone: "01000000050", category: "أثاث ومكاتب", gov: "القاهرة", city: "العبور", owner: "ليان فؤاد" },
    // حالات خاصة (إغلاق مؤكد / رقم غير صحيح / خارج الخدمة)
    { name: "مطعم الكورنيش البحري", phone: "01000000060", category: "مطاعم", gov: "الإسكندرية", city: "المندرة" }, // سيُعلَّم مغلق مؤكدًا
    { name: "بقالة أبو حسين", phone: "01000000061", category: "بقالات", gov: "الجيزة", city: "أطفيح", village: "كفر الحسيني" }, // رقم غير صحيح
    { name: "تصليح سيارات الحاج مدحت", phone: "01100000062", category: "ورش وحرف", gov: "الجيزة", city: "الهرم" }, // رقم خارج الخدمة
    // زوج مكرر بنفس الرقم (سيُدمج تلقائيًا في البذرة مثلًا لإثبات السلوك)
    { name: "مطعم الشام للمشويات", phone: "01000000070", category: "مطاعم", gov: "القاهرة", city: "الدقي", desc: "مشويات شرقية وأطباق شامية.", whatsapp: "01000000070", owner: "حسن عبده" },
  ];

  const listings: Record<string, string> = {}; // name → id
  for (const l of listingSeed) {
    const n = normalizePhone(l.phone);
    const owner = l.owner ? users[l.owner] : undefined;
    const row = await db.opsListing.create({
      data: {
        businessName: l.name,
        rawPhone: l.phone,
        normalizedPhone: n.canonical,
        whatsapp: l.whatsapp ?? null,
        category: l.category,
        governorate: l.gov,
        city: l.city,
        village: l.village ?? null,
        address: l.address ?? null,
        description: l.desc ?? null,
        images: JSON.stringify(l.images ?? []),
        socialLinks: JSON.stringify(l.social ?? {}),
        openingHours: l.hours ?? null,
        ownerUserId: owner?.id ?? null,
        ownerPhoneNormalized: owner?.normalizedPhone ?? null,
        status: "active",
      },
    });
    listings[l.name] = row.id;
  }

  // زوج مكرر بنفس الرقم — سيُنشأ ثم يُدمج فورًا لإثبات دورة الدمج الكاملة
  const dup = await db.opsListing.create({
    data: {
      businessName: "مطعم الشام - فرع الدقي الجديد",
      rawPhone: "01000000070",
      normalizedPhone: normalizePhone("01000000070").canonical,
      category: "مطاعم",
      governorate: "الجيزة",
      city: "الدقي",
      address: "شارع الترعة",
      images: JSON.stringify(["img-sham-dup-1"]),
      status: "active",
      source: "website_submission",
    },
  });
  const { mergeListings, findDuplicates } = await import("./duplicate");
  const dupMatches = await findDuplicates({
    businessName: "مطعم الشام - فرع الدقي الجديد",
    phone: "01000000070",
    category: "مطاعم",
    governorate: "الجيزة",
  });
  if (dupMatches.length > 0) {
    await mergeListings({
      canonicalId: dupMatches[0].listingId,
      duplicateId: dup.id,
      confidence: dupMatches[0].confidence,
      reasons: dupMatches[0].reasons,
      actor: { type: "system" },
      auto: true,
      source: "seed",
    });
  }

  // مراجعة يدوية معلّقة (اسم متطابق، رقم مختلف)
  const canPhone = normalizePhone("01000000021").canonical;
  const dupNameOnly = await db.opsListing.create({
    data: {
      businessName: "صيدلية الشفا فرع المعادي",
      rawPhone: "01000000051",
      normalizedPhone: normalizePhone("01000000051").canonical,
      category: "صيدليات",
      governorate: "القاهرة",
      city: "المعادي",
      status: "suspended",
      source: "website_submission",
    },
  });
  const nameOnlyMatch = await findDuplicates({
    businessName: "صيدلية الشفا فرع المعادي",
    phone: "01000000051",
    category: "صيدليات",
    governorate: "القاهرة",
  });
  if (nameOnlyMatch.length > 0) {
    await db.mergeJob.create({
      data: {
        canonicalListingId: nameOnlyMatch[0].listingId,
        duplicateListingId: dupNameOnly.id,
        confidence: nameOnlyMatch[0].confidence,
        reasons: JSON.stringify(nameOnlyMatch[0].reasons),
        status: "pending_review",
      },
    });
  }
  void canPhone;

  /* ------------------------------- Leads ------------------------------- */
  const outcomes: [string, string | null][] = [
    ["assigned", null], ["busy", "busy"], ["no_answer", "no_answer"], ["interested", "answered"],
    ["callback", "callback"], ["not_interested", "answered"], ["whatsapp_followup", "whatsapp_followup"],
    ["switched_off", "switched_off"], ["linked", "answered"], ["assigned", null], ["busy", "busy"],
    ["interested", "answered"], ["no_answer", "no_answer"], ["assigned", null],
  ];
  const leadNames: [string, string, string | undefined][] = [
    // [customerName, phone, listingName]
    ["سعيد عبد الحميد", "01000000071", undefined],
    ["عبد الله منصور", "01000000072", undefined],
    ["كريم عزت", "01000000073", undefined],
    ["ياسمين صابر", "01100000074", undefined],
    ["أحمد فتحي", "01100000075", undefined],
    ["منار عادل", "01100000076", undefined],
    ["هشام لطفي", "01200000077", undefined],
    ["دعاء كامل", "01200000078", undefined],
    ["مجدى رمضان", "01500000079", undefined],
    ["ريهام سعيد", "01500000080", undefined],
  ];

  let oi = 0;
  async function makeLead(customerName: string, phone: string, listingName?: string, campaign?: string) {
    const n = normalizePhone(phone);
    if (!n.ok) return;
    const listingId = listingName ? listings[listingName] : undefined;
    const listing = listingName ? listingSeed.find((l) => l.name === listingName) : undefined;
    const owner = listing?.owner ? users[listing.owner] : undefined;
    const [status, outcome] = outcomes[oi % outcomes.length];
    oi++;
    const res = await assignLeadFairly(n.prefix);
    const lead = await db.opsLead.create({
      data: {
        rawPhone: phone,
        normalizedPhone: n.canonical,
        prefix: n.prefix,
        listingId: listingId ?? null,
        userId: owner?.id ?? null,
        businessName: listingName ?? "",
        customerName,
        status,
        assignedAgentId: res.agentId,
        originalAgentId: res.agentId,
        lastOutcome: outcome,
        campaign: campaign ?? null,
        source: "admin",
      },
    });
    await db.timelineEvent.create({
      data: {
        leadId: lead.id,
        type: res.agentId ? "assigned" : "created",
        actorType: "system",
        title: res.agentId ? `تم التعيين للموظف ${res.agentName}` : "تم إنشاء العميل المحتمل",
        data: JSON.stringify({ rationale: res.rationale }),
      },
    });
    return lead;
  }

  const campaignNames = ["حملة ربط الأنشطة — نوفمبر", "حملة المتاجر الصغيرة", null];
  let ci = 0;
  // leads for listings (unclaimed mostly + claimed)
  for (const l of listingSeed) {
    if (l.name === "مطعم الشام للمشويات") continue;
    const campaign = campaignNames[ci++ % campaignNames.length] ?? undefined;
    const ownerPerson = l.owner ? users[l.owner].fullName : undefined;
    await makeLead(ownerPerson ?? "—", l.phone, l.name, campaign ?? undefined);
  }
  // extra phone-only leads (heavy 010/011 pool per spec)
  for (const [name, phone] of leadNames) {
    const campaign = campaignNames[ci++ % campaignNames.length] ?? undefined;
    await makeLead(name, phone, undefined, campaign ?? undefined);
  }

  /* --------------------------- Call attempts --------------------------- */
  const allLeads = await db.opsLead.findMany({ take: 40, orderBy: { createdAt: "asc" } });
  const atTypes: [string, string | null, string][] = [
    ["sales_agent", agentA.id, "answered"], ["sales_agent", agentB.id, "busy"],
    ["sales_agent", agentA.id, "no_answer"], ["sales_agent", agentB.id, "interested"],
    ["ai_agent", null, "answered"], ["sales_agent", agentA.id, "switched_off"],
    ["sales_agent", agentB.id, "callback"], ["ai_agent", null, "no_answer"],
    ["sales_agent", agentA.id, "busy"], ["sales_agent", agentB.id, "answered"],
  ];
  let ai = 0;
  for (const lead of allLeads) {
    const [type, agentId, outcome] = atTypes[ai % atTypes.length];
    ai++;
    await db.opsCallAttempt.create({
      data: {
        leadId: lead.id,
        agentType: type,
        agentId,
        outcome,
        durationSec: outcome === "answered" ? 120 + (ai % 240) : 0,
        notes: type === "ai_agent" ? "محاكاة AI Bot" : null,
        createdAt: new Date(Date.now() - (ai + 1) * 3600_000 * 5),
      },
    });
  }

  /* ----------------------------- Followups ------------------------------ */
  const fuLeads = allLeads.slice(0, 6);
  await db.opsFollowup.createMany({
    data: fuLeads.map((l, i) => ({
      leadId: l.id,
      scheduledAt: new Date(Date.now() + (i - 2) * 24 * 3600_000),
      reason: i % 2 === 0 ? "إعادة محاولة بعد عدم الرد" : "موعد اتصال حدده العميل",
      assigneeId: l.assignedAgentId,
      priority: i === 0 ? "high" : "normal",
      status: "scheduled",
    })),
  });

  /* ---------------------------- Bot queue ------------------------------- */
  const botLeads = allLeads.slice(30, 33);
  if (botLeads[0]) {
    await db.botQueueItem.create({ data: { leadId: botLeads[0].id, status: "queued", priority: 3, addedAt: new Date() } });
    await db.opsLead.update({ where: { id: botLeads[0].id }, data: { botStatus: "queued", status: "queued" } });
  }
  if (botLeads[1]) {
    await db.botQueueItem.create({
      data: { leadId: botLeads[1].id, status: "running", priority: 5, startedAt: new Date(Date.now() - 60_000), addedAt: new Date(Date.now() - 70_000) },
    });
    await db.opsLead.update({ where: { id: botLeads[1].id }, data: { botStatus: "running", status: "calling" } });
  }
  if (botLeads[2]) {
    await db.botQueueItem.create({ data: { leadId: botLeads[2].id, status: "queued", priority: 8, addedAt: new Date() } });
    await db.opsLead.update({ where: { id: botLeads[2].id }, data: { botStatus: "queued", status: "queued" } });
  }

  /* ------------------------------ WhatsApp ------------------------------ */
  const waLeads = allLeads.slice(4, 7);
  for (const [i, lead] of waLeads.entries()) {
    const thread = await db.whatsAppThread.create({
      data: { leadId: lead.id, phoneNormalized: lead.normalizedPhone, displayName: lead.customerName || lead.businessName || lead.normalizedPhone, listingId: lead.listingId },
    });
    const msgs: [string, string, string, number][] = [
      ["out", "أهلًا أستاذ/ة، معك أحمد من فريق دليلي — عايز أتأكد من بيانات نشاطك على المنصة", "read", i],
      ["in", "تمام جدًا، ابعترلي التفاصيل", "received", i],
      ["out", "تحب أبعتلك عرض الاشتراك والباقات المتاحة؟", "delivered", i],
    ];
    let lastAt = new Date();
    for (const [dir, body, status] of msgs) {
      const created = new Date(lastAt.getTime() + 60_000);
      lastAt = created;
      await db.whatsAppMessage.create({
        data: {
          threadId: thread.id,
          direction: dir as "in" | "out",
          body,
          status,
          actorType: dir === "out" ? "sales_agent" : "customer",
          sentAt: dir === "out" ? created : null,
          deliveredAt: dir === "out" && status !== "sent" ? created : null,
          readAt: dir === "out" && status === "read" ? created : null,
          createdAt: created,
        },
      });
    }
    await db.whatsAppThread.update({ where: { id: thread.id }, data: { lastMessageAt: lastAt, unreadCount: 0 } });
    await db.timelineEvent.create({
      data: { leadId: lead.id, type: "whatsapp_sent", actorType: "sales_agent", title: "متابعة واتساب مرسلة للعميل", data: JSON.stringify({ threadId: thread.id }) },
    });
  }

  /* --------------------------- Special cases ---------------------------- */
  // 1) confirmed closed business → hidden per policy + audit (restorable)
  const closedId = listings["مطعم الكورنيش البحري"];
  if (closedId) {
    const closedLead = await db.opsLead.findFirst({ where: { listingId: closedId } });
    await db.opsListing.update({
      where: { id: closedId },
      data: { status: "closed_business" },
    });
    if (closedLead) {
      await db.opsLead.update({ where: { id: closedLead.id }, data: { status: "closed_business", lastOutcome: "closed_business" } });
      await db.timelineEvent.create({
        data: { leadId: closedLead.id, type: "listing_hidden", actorType: "sales_agent", title: "تم إخفاء النشاط من النتائج العامة بعد تأكيد الإغلاق النهائي من المالك", data: JSON.stringify({ reason: "owner_confirmed_closed", confidence: 95 }) },
      });
    }
    await db.auditLog.create({
      data: {
        actorType: "sales_agent",
        actorId: agentA.id,
        action: "listing.status_changed",
        entityType: "listing",
        entityId: closedId,
        oldValue: JSON.stringify({ status: "active" }),
        newValue: JSON.stringify({ status: "closed_business", hidden: true }),
        reason: "owner_confirmed_closed — تأكيد إغلاق نهائي من صاحب النشاط",
        source: "call_confirmation",
        metadata: JSON.stringify({ confidence: 95, restorable: true }),
      },
    });
  }
  // 2) invalid number → status recorded, business NOT auto-hidden (rule demo)
  const invalidId = listings["بقالة أبو حسين"];
  if (invalidId) {
    const invalidLead = await db.opsLead.findFirst({ where: { listingId: invalidId } });
    if (invalidLead) {
      await db.opsCallAttempt.create({
        data: { leadId: invalidLead.id, agentType: "sales_agent", agentId: agentB.id, outcome: "invalid_number", reason: "الشبكة ترسل رسالة أن الرقم غير موجود", confidence: 90, notes: "تم تسجيل السبب — النشاط يظل ظاهرًا حتى التأكيد النهائي" },
      });
      await db.opsLead.update({ where: { id: invalidLead.id }, data: { status: "invalid_number", lastOutcome: "invalid_number" } });
    }
  }
  // 3) disabled employee with open leads → reassign safely (FLOW M)
  const disabledLeads = allLeads.slice(36, 40);
  for (const l of disabledLeads) {
    await db.opsLead.update({ where: { id: l.id }, data: { assignedAgentId: disabledAgent.id, status: "assigned" } });
  }
  const { reassignOpenLeads } = await import("./assignment");
  await reassignOpenLeads(disabledAgent.id, { type: "admin", id: admin.id, name: "أحمد المصري" });
  await db.auditLog.create({
    data: {
      actorType: "admin",
      actorId: admin.id,
      action: "agent.disabled",
      entityType: "sales_agent",
      entityId: disabledAgent.id,
      newValue: JSON.stringify({ status: "disabled" }),
      reason: "demo — إعادة توزيع آمنة للعملاء المفتوحين مع الحفاظ على السجل",
      source: "seed",
    },
  });

  /* ---------------------------- Notifications --------------------------- */
  await db.opsNotification.create({
    data: {
      targetUserId: users["حسن عبده"].id,
      targetPhone: users["حسن عبده"].normalizedPhone,
      title: "تم ربط نشاطك بنجاح",
      body: "تم ربط نشاطك بحسابك بنجاح وتم تحديث بيانات النشاط",
      type: "success",
    },
  });
  await db.opsNotification.createMany({
    data: [
      { targetUserId: agentA.id, title: "عميل محتمل جديد", body: "تم تعيين عميلين جديدين إليك اليوم (010)", type: "info" },
      { targetUserId: agentB.id, title: "تذكير متابعة", body: "لديك متابعة واتساب معلقة لعميل من حملة نوفمبر", type: "warning" },
    ],
  });

  await db.auditLog.create({
    data: {
      actorType: "system",
      action: "seed.completed",
      entityType: "system",
      newValue: JSON.stringify({ listings: listingSeed.length + 2, leads: "auto", note: "demo data seeded" }),
      source: "seed",
    },
  });
}
