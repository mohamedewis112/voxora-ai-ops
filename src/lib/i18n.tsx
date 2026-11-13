"use client";

/**
 * Lightweight i18n for Voxora AI.
 * Arabic is the primary language (RTL-first); English is a full toggle.
 * Dictionary entries are `[ar, en]` tuples so both languages stay in sync.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Lang = "ar" | "en";

type Entry = [string, string]; // [ar, en]

const DICT: Record<string, Entry> = {
  /* ------------------------------ App chrome ------------------------------ */
  "app.name": ["Voxora Sales", "Voxora Sales"],
  "app.tagline": [
    "منصة إدارة المبيعات ومتابعة العملاء",
    "Sales & Customer Follow-up Platform",
  ],
  "app.simulation": ["وضع المحاكاة", "Simulation mode"],
  "app.simulationNote": [
    "لن يتم إجراء أي مكالمات حقيقية — البيانات تجريبية",
    "No real calls are made — demo data only",
  ],
  "app.footerRights": ["جميع الحقوق محفوظة", "All rights reserved"],
  "app.connected": ["متصل بـ", "Connected to"],
  "app.mockProvider": ["مزود المحاكاة", "Mock provider"],
  "app.lang": ["English", "العربية"],
  "app.downloadHint": ["آخر نسخة مطابقة للبريفيو", "Latest snapshot matching the live preview"],

  /* ------------------------------ Navigation ------------------------------ */
  "nav.group.main": ["التشغيل", "Operations"],
  "nav.group.crm": ["إدارة العملاء", "CRM"],
  "nav.group.system": ["النظام", "System"],
  "nav.dashboard": ["الرئيسية", "Dashboard"],
  "nav.calls": ["المكالمات", "Calls"],
  "nav.contacts": ["جهات الاتصال", "Contacts"],
  "nav.campaigns": ["الحملات", "Campaigns"],
  "nav.leads": ["العملاء المحتملون", "Leads"],
  "nav.agent": ["الإيجنت", "AI Agent"],
  "nav.knowledge": ["قاعدة المعرفة", "Knowledge Base"],
  "nav.followups": ["المتابعة", "Follow-ups"],
  "nav.analytics": ["التحليلات", "Analytics"],
  "nav.recordings": ["التسجيلات", "Recordings"],
  "nav.settings": ["الإعدادات", "Settings"],
  "nav.queue": ["قائمة الانتظار", "Call Queue"],

  /* ------------------------------- Common --------------------------------- */
  "common.search": ["بحث…", "Search…"],
  "common.searchPlaceholder": ["ابحث بالاسم أو رقم الهاتف", "Search by name or phone"],
  "common.add": ["إضافة", "Add"],
  "common.new": ["جديد", "New"],
  "common.edit": ["تعديل", "Edit"],
  "common.delete": ["حذف", "Delete"],
  "common.save": ["حفظ", "Save"],
  "common.saveChanges": ["حفظ التغييرات", "Save changes"],
  "common.cancel": ["إلغاء", "Cancel"],
  "common.confirm": ["تأكيد", "Confirm"],
  "common.close": ["إغلاق", "Close"],
  "common.actions": ["إجراءات", "Actions"],
  "common.all": ["الكل", "All"],
  "common.none": ["بدون", "None"],
  "common.name": ["الاسم", "Name"],
  "common.phone": ["رقم الهاتف", "Phone"],
  "common.status": ["الحالة", "Status"],
  "common.date": ["التاريخ", "Date"],
  "common.time": ["الوقت", "Time"],
  "common.notes": ["ملاحظات", "Notes"],
  "common.campaign": ["الحملة", "Campaign"],
  "common.agent": ["الموظف / الإيجنت", "Agent"],
  "common.duration": ["المدة", "Duration"],
  "common.result": ["النتيجة", "Result"],
  "common.type": ["النوع", "Type"],
  "common.category": ["التصنيف", "Category"],
  "common.area": ["المنطقة", "Area"],
  "common.city": ["المدينة", "City"],
  "common.source": ["المصدر", "Source"],
  "common.tags": ["الوسوم", "Tags"],
  "common.business": ["اسم النشاط", "Business name"],
  "common.details": ["التفاصيل", "Details"],
  "common.view": ["عرض", "View"],
  "common.today": ["اليوم", "Today"],
  "common.yesterday": ["أمس", "Yesterday"],
  "common.last7": ["آخر 7 أيام", "Last 7 days"],
  "common.last30": ["آخر 30 يومًا", "Last 30 days"],
  "common.custom": ["فترة مخصصة", "Custom"],
  "common.from": ["من", "From"],
  "common.to": ["إلى", "To"],
  "common.apply": ["تطبيق", "Apply"],
  "common.reset": ["إعادة تعيين", "Reset"],
  "common.filters": ["الفلاتر", "Filters"],
  "common.loading": ["جارٍ التحميل…", "Loading…"],
  "common.noResults": ["لا توجد نتائج مطابقة", "No matching results"],
  "common.noResultsDesc": ["جرّب تغيير الفلاتر أو مصطلحات البحث", "Try adjusting filters or search"],
  "common.noData": ["لا توجد بيانات بعد", "No data yet"],
  "common.required": ["هذا الحقل مطلوب", "This field is required"],
  "common.optional": ["اختياري", "Optional"],
  "common.items": ["عنصر", "items"],
  "common.selected": ["محدد", "selected"],
  "common.confirmDeleteTitle": ["تأكيد الحذف", "Confirm deletion"],
  "common.confirmDeleteDesc": [
    "لا يمكن التراجع عن هذا الإجراء.",
    "This action cannot be undone.",
  ],
  "common.seconds": ["ثانية", "sec"],
  "common.minutes": ["دقيقة", "min"],
  "common.hours": ["ساعة", "hours"],
  "common.days": ["يوم", "days"],
  "common.updated": ["تم التحديث", "Updated"],
  "common.savedToast": ["تم الحفظ بنجاح", "Saved successfully"],
  "common.deleteToast": ["تم الحذف", "Deleted"],
  "common.createdToast": ["تمت الإضافة بنجاح", "Created successfully"],
  "common.unsaved": ["تغييرات غير محفوظة", "Unsaved changes"],
  "common.score": ["درجة الجاهزية", "Lead score"],
  "common.showing": ["عرض", "Showing"],
  "common.of": ["من", "of"],
  "common.showMore": ["عرض المزيد", "Show more"],
  "common.export": ["تصدير CSV", "Export CSV"],
  "common.import": ["استيراد", "Import"],
  "common.language": ["اللغة", "Language"],
  "common.theme": ["المظهر", "Theme"],
  "common.dark": ["داكن", "Dark"],
  "common.light": ["فاتح", "Light"],
  "common.system": ["النظام", "System"],
  "common.notifications": ["الإشعارات", "Notifications"],
  "common.noNotifications": ["لا توجد إشعارات جديدة", "No new notifications"],
  "common.logout": ["تسجيل الخروج", "Sign out"],
  "common.account": ["حسابي", "Account"],
  "common.profile": ["الملف الشخصي", "Profile"],
  "common.role": ["الدور", "Role"],
  "common.email": ["البريد الإلكتروني", "Email"],
  "common.password": ["كلمة المرور", "Password"],
  "common.overview": ["نظرة عامة", "Overview"],
  "common.startTime": ["وقت البدء", "Start time"],
  "common.at": ["في", "at"],
  "common.callNow": ["اتصال الآن", "Call now"],
  "common.done": ["تم", "Done"],
  "common.snooze": ["تأجيل", "Snooze"],

  /* --------------------------- Call statuses ------------------------------ */
  "status.answered": ["تم الرد", "Answered"],
  "status.no_answer": ["لم يرد", "No answer"],
  "status.busy": ["مشغول", "Busy"],
  "status.wrong_number": ["رقم غير صحيح", "Wrong number"],
  "status.failed": ["مكالمة فاشلة", "Failed"],

  /* --------------------------- Call outcomes ------------------------------ */
  "outcome.interested": ["مهتم", "Interested"],
  "outcome.not_interested": ["غير مهتم", "Not interested"],
  "outcome.callback": ["اتصال لاحقًا", "Callback"],
  "outcome.transferred": ["تم التحويل لموظف", "Transferred to human"],
  "outcome.sale": ["تم البيع", "Sale"],
  "outcome.info": ["استفسار", "Info request"],
  "outcome.none": ["بدون نتيجة", "No outcome"],

  /* ---------------------------- Agent status ------------------------------ */
  "agentStatus.offline": ["متوقف", "Offline"],
  "agentStatus.ready": ["جاهز للعمل", "Ready"],
  "agentStatus.paused": ["متوقف مؤقتًا", "Paused"],
  "agentStatus.calling": ["جارٍ الاتصال الآن", "Dialing"],
  "agentStatus.connected": ["متصل", "Connected"],
  "agentStatus.speaking": ["يتحدث الآن", "Speaking"],
  "agentStatus.listening": ["يستمع للعميل", "Listening"],
  "agentStatus.processing": ["يحلل الرد", "Processing"],
  "agentStatus.transferred": ["تم التحويل لموظف", "Transferred"],
  "agentStatus.completed": ["اكتملت المكالمة", "Completed"],
  "agentStatus.failed": ["فشلت المكالمة", "Failed"],

  /* -------------------------- Campaign statuses --------------------------- */
  "campaignStatus.draft": ["مسودة", "Draft"],
  "campaignStatus.scheduled": ["مجدولة", "Scheduled"],
  "campaignStatus.running": ["جارية", "Running"],
  "campaignStatus.paused": ["متوقفة", "Paused"],
  "campaignStatus.completed": ["مكتملة", "Completed"],

  /* ----------------------------- Lead stages ------------------------------ */
  "stage.new": ["جديد", "New"],
  "stage.contacted": ["تم التواصل", "Contacted"],
  "stage.interested": ["مهتم", "Interested"],
  "stage.followup": ["متابعة", "Follow-up"],
  "stage.ready_to_close": ["جاهز للإغلاق", "Ready to close"],
  "stage.transferred": ["تم التحويل لموظف", "Transferred"],
  "stage.won": ["تم البيع", "Won"],
  "stage.lost": ["غير مهتم", "Lost"],

  /* ---------------------------- Queue statuses ---------------------------- */
  "queueStatus.waiting": ["في الانتظار", "Waiting"],
  "queueStatus.calling": ["جارٍ الاتصال", "Dialing"],
  "queueStatus.paused": ["متوقف مؤقتًا", "Paused"],
  "queueStatus.done": ["منتهية", "Done"],
  "queueStatus.canceled": ["ملغاة", "Canceled"],

  /* -------------------------- Follow-up statuses -------------------------- */
  "followUpStatus.pending": ["قيد الانتظار", "Pending"],
  "followUpStatus.done": ["تم التواصل", "Done"],
  "followUpStatus.postponed": ["مؤجل", "Postponed"],
  "followUpStatus.canceled": ["ملغي", "Canceled"],

  /* -------------------------- Contact statuses ---------------------------- */
  "contactStatus.active": ["نشط", "Active"],
  "contactStatus.dnd": ["عدم الاتصال مرة أخرى", "Do not call"],
  "contactStatus.archived": ["مؤرشف", "Archived"],
  "contactStatus.wrong_number": ["رقم غير صحيح", "Wrong number"],

  /* ------------------------------- Priority ------------------------------- */
  "priority.high": ["عالية", "High"],
  "priority.normal": ["عادية", "Normal"],
  "priority.low": ["منخفضة", "Low"],

  /* ------------------------------- Sentiment ------------------------------ */
  "sentiment.positive": ["إيجابي", "Positive"],
  "sentiment.neutral": ["محايد", "Neutral"],
  "sentiment.negative": ["سلبي", "Negative"],

  /* ------------------------------- Direction ------------------------------ */
  "direction.outbound": ["صادرة", "Outbound"],
  "direction.inbound": ["واردة", "Inbound"],

  /* ------------------------------ Recordings ------------------------------ */
  "recording.available": ["متاح", "Available"],
  "recording.pending": ["قيد المعالجة", "Pending"],
  "recording.unavailable": ["غير متاح", "Unavailable"],
  "recordings.title": ["تسجيلات المكالمات", "Call recordings"],
  "recordings.desc": [
    "يتم تخزين التسجيلات على خادمك الخاص بعد ربط محرك الهاتف",
    "Recordings are stored on your own server once the telephony engine is connected",
  ],
  "recordings.total": ["إجمالي التسجيلات", "Total recordings"],
  "recordings.storage": ["التخزين المستخدم", "Storage used"],
  "recordings.retention": ["مدة الاحتفاظ", "Retention"],
  "recordings.retentionVal": ["30 يومًا", "30 days"],
  "recordings.playerSoon": [
    "التشغيل متاح بعد ربط محرك الهاتف — المشغل مجرد واجهة placeholder",
    "Playback unlocks after the telephony engine is connected — this player is a placeholder",
  ],
  "recordings.download": ["تنزيل", "Download"],
  "recordings.play": ["تشغيل", "Play"],
  "recordings.waveform": ["الموجة الصوتية", "Waveform"],

  /* -------------------------------- Roles --------------------------------- */
  "role.admin": ["مدير النظام", "Admin"],
  "role.manager": ["مدير", "Manager"],
  "role.sales_agent": ["موظف مبيعات", "Sales agent"],
  "role.viewer": ["مشاهد", "Viewer"],
  "roleDesc.admin": [
    "وصول كامل لكل شيء: الإعدادات، الحملات، الأرقام السرية، وإدارة المستخدمين",
    "Full access: settings, campaigns, secrets and user management",
  ],
  "roleDesc.manager": [
    "إدارة الحملات والإيجنت والتحليلات بدون الوصول لإعدادات الخادم",
    "Manages campaigns, agent and analytics — no server settings",
  ],
  "roleDesc.sales_agent": [
    "يستلم العملاء المحوّلين ويدير المتابعات والعروض",
    "Receives transferred leads and manages follow-ups and offers",
  ],
  "roleDesc.viewer": [
    "مشاهدة فقط بدون أي تعديل على البيانات",
    "Read-only access — no data changes",
  ],

  /* ------------------------------- Auth ----------------------------------- */
  "auth.loginTitle": ["تسجيل الدخول", "Sign in"],
  "auth.loginDesc": [
    "أدخل بياناتك للوصول إلى مركز التحكم",
    "Enter your credentials to access the control center",
  ],
  "auth.demoLogin": ["الدخول بحساب تجريبي", "Continue with demo account"],
  "auth.login": ["دخول", "Sign in"],
  "auth.forgot": ["نسيت كلمة المرور؟", "Forgot password?"],
  "auth.forgotTitle": ["استعادة كلمة المرور", "Reset password"],
  "auth.forgotDesc": [
    "أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة (جاهز لـ Supabase Auth)",
    "Enter your email and we will send a reset link (Supabase Auth ready)",
  ],
  "auth.sendReset": ["إرسال رابط الاستعادة", "Send reset link"],
  "auth.resetSent": [
    "تم إرسال رابط الاستعادة إلى بريدك",
    "Reset link sent to your email",
  ],
  "auth.backToLogin": ["العودة لتسجيل الدخول", "Back to sign in"],
  "auth.remember": ["تذكرني", "Remember me"],
  "auth.demoHint": [
    "بيانات الدخول التجريبية تعمل بدون خادم",
    "Demo credentials work without a server",
  ],

  /* ------------------------------ Account --------------------------------- */
  "account.title": ["حسابي", "My account"],
  "account.desc": [
    "إدارة ملفك الشخصي ودورك في النظام",
    "Manage your profile and system role",
  ],
  "account.name": ["الاسم الكامل", "Full name"],
  "account.changePassword": ["تغيير كلمة المرور", "Change password"],
  "account.currentPassword": ["كلمة المرور الحالية", "Current password"],
  "account.newPassword": ["كلمة المرور الجديدة", "New password"],
  "account.rolesTitle": ["أدوار النظام", "System roles"],
  "account.rolesDesc": [
    "تحدد الأدوار صلاحيات الوصول عند ربط Supabase Auth",
    "Roles define access permissions once Supabase Auth is connected",
  ],
  "account.session": ["الجلسة", "Session"],
  "account.sessionActive": ["الجلسة نشطة", "Session active"],

  /* ------------------------------ Dashboard ------------------------------- */
  "dash.title": ["لوحة التحكم", "Dashboard"],
  "dash.desc": [
    "ملخص أداء الإيجنت والمكالمات اليوم",
    "Agent performance and today's calls summary",
  ],
  "dash.callsToday": ["مكالمات اليوم", "Calls today"],
  "dash.answered": ["تم الرد", "Answered"],
  "dash.noAnswer": ["لم يتم الرد", "No answer"],
  "dash.interested": ["عملاء مهتمون", "Interested"],
  "dash.transferred": ["تحويل لموظف", "Human transfers"],
  "dash.followups": ["مواعيد متابعة", "Follow-ups due"],
  "dash.avgDuration": ["متوسط مدة المكالمة", "Avg. call duration"],
  "dash.successRate": ["نسبة النجاح", "Success rate"],
  "dash.vsYesterday": ["مقارنة بالأمس", "vs yesterday"],
  "dash.liveTitle": ["موظف الذكاء الاصطناعي", "AI Agent"],
  "dash.liveAgentName": ["نور — موظف المبيعات الذكي", "Nour — AI sales agent"],
  "dash.start": ["تشغيل الإيجنت", "Start agent"],
  "dash.pause": ["إيقاف مؤقت", "Pause"],
  "dash.stop": ["إيقاف", "Stop"],
  "dash.simulateCall": ["بدء مكالمة تجريبية", "Simulate a call"],
  "dash.currentlyCalling": ["جارٍ التحدث مع", "Currently talking to"],
  "dash.liveTranscript": ["المحادثة المباشرة", "Live transcript"],
  "dash.queueEmpty": ["قائمة الانتظار فارغة — أضف جهات اتصال لحملة جارية", "Queue is empty — add contacts to a running campaign"],
  "dash.recentCalls": ["أحدث المكالمات", "Recent calls"],
  "dash.viewAll": ["عرض الكل", "View all"],
  "dash.todayFollowups": ["متابعات اليوم", "Today's follow-ups"],
  "dash.noFollowupsToday": ["لا توجد متابعات مجدولة اليوم", "No follow-ups scheduled today"],
  "dash.callsTrend": ["المكالمات خلال 7 أيام", "Calls — last 7 days"],
  "dash.agentIdle": ["الإيجنت جاهز وسيتصل بالعملاء تلقائيًا من قائمة الانتظار", "Agent is ready and will dial contacts from the queue automatically"],
  "dash.agentOfflineHint": ["شغّل الإيجنت لبدء المكالمات التلقائية", "Start the agent to begin auto dialing"],
  "dash.pausedHint": ["الإيجنت متوقف مؤقتًا — لن يتم بدء مكالمات جديدة", "Agent paused — no new calls will start"],
  "dash.finished": ["انتهت المكالمة", "Call finished"],
  "dash.outcomeWas": ["النتيجة", "Outcome"],

  /* -------------------------------- Calls --------------------------------- */
  "calls.title": ["المكالمات", "Calls"],
  "calls.desc": ["سجل كامل لجميع المكالمات الصادرة والواردة", "Full log of outbound and inbound calls"],
  "calls.historyTab": ["سجل المكالمات", "Call history"],
  "calls.queueTab": ["قائمة الانتظار", "Call queue"],
  "calls.contactName": ["اسم العميل", "Customer"],
  "calls.details": ["تفاصيل المكالمة", "Call details"],
  "calls.filterCampaign": ["الحملة", "Campaign"],
  "calls.filterStatus": ["حالة المكالمة", "Call status"],
  "calls.filterOutcome": ["النتيجة", "Outcome"],
  "calls.filterAgent": ["الموظف", "Agent"],
  "calls.filterDate": ["الفترة", "Date range"],
  "calls.results": ["نتيجة", "results"],
  "calls.noCalls": ["لا توجد مكالمات مطابقة", "No matching calls"],
  "calls.noCallsDesc": ["شغّل الإيجنت أو عدّل الفلاتر", "Start the agent or adjust filters"],
  "calls.record": ["تسجيل المكالمة", "Recording"],
  "calls.transcript": ["النص الكامل للمحادثة", "Full transcript"],
  "calls.summary": ["ملخص المحادثة", "Conversation summary"],
  "calls.aiNotes": ["ملاحظات الإيجنت الذكية", "AI-generated notes"],
  "calls.followUpAction": ["إجراء المتابعة", "Follow-up action"],
  "calls.extracted": ["معلومات مهمة مستخرجة", "Key information extracted"],
  "calls.sentiment": ["مزاج العميل", "Customer sentiment"],
  "calls.agentLine": ["الإيجنت", "Agent"],
  "calls.customerLine": ["العميل", "Customer"],
  "calls.systemLine": ["النظام", "System"],
  "calls.callAgain": ["اتصال مرة أخرى", "Call again"],
  "calls.retry": ["إعادة محاولة", "Retry"],

  /* ----------------------------- Call queue -------------------------------- */
  "queue.title": ["قائمة الانتظار", "Call queue"],
  "queue.desc": ["جهات الاتصال التي سيتصل بها الإيجنت تلقائيًا", "Contacts the agent will dial automatically"],
  "queue.order": ["الترتيب", "Order"],
  "queue.attempts": ["المحاولات", "Attempts"],
  "queue.priority": ["الأولوية", "Priority"],
  "queue.scheduled": ["الموعد المجدول", "Scheduled"],
  "queue.pauseAll": ["إيقاف القائمة مؤقتًا", "Pause queue"],
  "queue.resumeAll": ["استئناف القائمة", "Resume queue"],
  "queue.clearDone": ["مسح المنتهية", "Clear finished"],
  "queue.moveUp": ["أعلى", "Move up"],
  "queue.moveDown": ["أسفل", "Move down"],
  "queue.top": ["إلى الأعلى", "To top"],
  "queue.remove": ["إزالة من القائمة", "Remove from queue"],
  "queue.prioritize": ["رفع الأولوية", "Prioritize"],
  "queue.empty": ["قائمة الانتظار فارغة", "Queue is empty"],
  "queue.emptyDesc": ["أضف جهات اتصال لحملة جارية لتظهر هنا", "Assign contacts to a running campaign"],
  "queue.dndBlocked": ["محجوب — طلب عدم الاتصال", "Blocked — do-not-call"],

  /* ------------------------------- Contacts -------------------------------- */
  "contacts.title": ["جهات الاتصال", "Contacts"],
  "contacts.desc": ["قاعدة بيانات العملاء والأنشطة التجارية", "Customer and business database"],
  "contacts.add": ["إضافة جهة اتصال", "Add contact"],
  "contacts.import": ["استيراد CSV / Excel", "Import CSV / Excel"],
  "contacts.businessCategory": ["تصنيف النشاط", "Business category"],
  "contacts.lastCall": ["آخر مكالمة", "Last call"],
  "contacts.nextFollowUp": ["المتابعة القادمة", "Next follow-up"],
  "contacts.assignedCampaign": ["الحملة المسندة", "Assigned campaign"],
  "contacts.assignCampaign": ["تعيين لحملة", "Assign campaign"],
  "contacts.archive": ["أرشفة", "Archive"],
  "contacts.unarchive": ["إلغاء الأرشفة", "Unarchive"],
  "contacts.dndToggle": ["عدم الاتصال مرة أخرى", "Do not call again"],
  "contacts.dndWarning": [
    "لن يظهر هذا الرقم في أي حملة مستقبلية إلا بتدخل يدوي من مدير",
    "This number will be excluded from future campaigns unless manually overridden by a manager",
  ],
  "contacts.editContact": ["تعديل جهة الاتصال", "Edit contact"],
  "contacts.noContacts": ["لا توجد جهات اتصال", "No contacts"],
  "contacts.noContactsDesc": ["أضف جهة اتصال يدويًا أو استورد ملف CSV / Excel", "Add a contact manually or import CSV / Excel"],
  "contacts.bulk": ["إجراءات جماعية", "Bulk actions"],
  "contacts.bulkArchive": ["أرشفة المحدد", "Archive selected"],
  "contacts.bulkDelete": ["حذف المحدد", "Delete selected"],
  "contacts.bulkDnd": ["عدم اتصال", "Mark do-not-call"],
  "contacts.callHistory": ["سجل المكالمات", "Call history"],
  "contacts.totalContacts": ["إجمالي جهات الاتصال", "Total contacts"],
  "contacts.dndCount": ["محجوبون", "Do-not-call"],
  "contacts.archivedCount": ["مؤرشفون", "Archived"],
  "contacts.withCampaign": ["مخصصون لحملات", "Assigned to campaigns"],

  /* -------------------------------- Import --------------------------------- */
  "import.title": ["استيراد جهات اتصال", "Import contacts"],
  "import.desc": [
    "ارفع ملف CSV أو Excel وقم بمطابقة الأعمدة",
    "Upload a CSV or Excel file and map the columns",
  ],
  "import.upload": ["اسحب الملف هنا أو انقر للاختيار", "Drop file here or click to browse"],
  "import.formats": ["الصيغ المدعومة: CSV, XLSX, XLS", "Supported formats: CSV, XLSX, XLS"],
  "import.step1": ["رفع الملف", "Upload"],
  "import.step2": ["مطابقة الأعمدة", "Column mapping"],
  "import.step3": ["المراجعة والاستيراد", "Review & import"],
  "import.mapName": ["الاسم", "Name"],
  "import.mapPhone": ["رقم الهاتف", "Phone number"],
  "import.mapBusiness": ["اسم النشاط", "Business name"],
  "import.mapCategory": ["التصنيف", "Category"],
  "import.mapArea": ["المنطقة", "Area"],
  "import.mapNotes": ["ملاحظات", "Notes"],
  "import.mapColumn": ["العمود في الملف", "File column"],
  "import.autoDetected": ["تم التعرف تلقائيًا", "Auto-detected"],
  "import.skipDuplicates": ["تخطي أرقام الهاتف المكررة", "Skip duplicate phone numbers"],
  "import.preview": ["معاينة أول 8 صفوف", "Preview — first 8 rows"],
  "import.valid": ["جهات صالحة", "Valid contacts"],
  "import.duplicates": ["أرقام مكررة", "Duplicates"],
  "import.invalid": ["أرقام غير صالحة", "Invalid numbers"],
  "import.rows": ["صف", "rows"],
  "import.importBtn": ["استيراد {count} جهة اتصال", "Import {count} contacts"],
  "import.importedToast": ["تم استيراد {count} جهة اتصال بنجاح", "Imported {count} contacts successfully"],
  "import.chooseFile": ["اختيار ملف", "Choose file"],
  "import.replaceFile": ["ملف آخر", "Replace file"],
  "import.noPhoneColumn": ["اختر العمود المطابق لرقم الهاتف", "Select the column mapped to phone number"],

  /* ------------------------------- Campaigns -------------------------------- */
  "campaigns.title": ["الحملات", "Campaigns"],
  "campaigns.desc": ["تنظيم المكالمات الصادرة حسب الهدف", "Organize outbound calling by purpose"],
  "campaigns.add": ["حملة جديدة", "New campaign"],
  "campaigns.name": ["اسم الحملة", "Campaign name"],
  "campaigns.purpose": ["الغرض", "Purpose"],
  "campaigns.callType": ["نوع المكالمة", "Call type"],
  "campaigns.startDate": ["تاريخ البدء", "Start date"],
  "campaigns.allowedTimes": ["أوقات الاتصال المسموحة", "Allowed calling times"],
  "campaigns.maxCallsPerDay": ["أقصى عدد مكالمات يوميًا", "Max calls per day"],
  "campaigns.retryAttempts": ["عدد محاولات إعادة الاتصال", "Retry attempts"],
  "campaigns.retryDelay": ["الفاصل بين المحاولات (ساعة)", "Retry delay (hours)"],
  "campaigns.knowledge": ["قاعدة المعرفة", "Knowledge base"],
  "campaigns.targetContacts": ["جهات الاتصال المستهدفة", "Target contacts"],
  "campaigns.campaignStatus": ["حالة الحملة", "Campaign status"],
  "campaigns.details": ["تفاصيل الحملة", "Campaign details"],
  "campaigns.totalContacts": ["إجمالي جهات الاتصال", "Total contacts"],
  "campaigns.callsCompleted": ["مكالمات مكتملة", "Calls completed"],
  "campaigns.answered": ["تم الرد", "Answered"],
  "campaigns.noAnswer": ["لم يرد", "No answer"],
  "campaigns.interested": ["مهتمون", "Interested"],
  "campaigns.notInterested": ["غير مهتمين", "Not interested"],
  "campaigns.callbacks": ["اتصالات لاحقة", "Callbacks"],
  "campaigns.conversions": ["تحويلات لموظف", "Conversions"],
  "campaigns.successRate": ["نسبة النجاح", "Success rate"],
  "campaigns.start": ["تشغيل الحملة", "Start campaign"],
  "campaigns.pause": ["إيقاف مؤقت", "Pause campaign"],
  "campaigns.complete": ["إنهاء الحملة", "Complete campaign"],
  "campaigns.outcomesBreakdown": ["توزيع النتائج", "Outcomes breakdown"],
  "campaigns.recentCalls": ["أحدث المكالمات", "Recent calls"],
  "campaigns.noCampaigns": ["لا توجد حملات بعد", "No campaigns yet"],
  "campaigns.noCampaignsDesc": ["أنشئ أول حملة لبدء الاتصال بعملائك", "Create your first campaign to start dialing"],
  "campaigns.dndExcluded": [
    "الجهات المطلوب عدم الاتصال بها مستبعدة تلقائيًا",
    "Do-not-call contacts are excluded automatically",
  ],
  "callType.outbound_sales": ["مبيعات صادرة", "Outbound sales"],
  "callType.customer_service": ["خدمة عملاء", "Customer service"],
  "callType.followup": ["متابعة", "Follow-up"],
  "callType.appointments": ["حجز مواعيد", "Appointments"],
  "callType.survey": ["استبيان", "Survey"],

  /* --------------------------------- Leads ---------------------------------- */
  "leads.title": ["العملاء المحتملون", "Leads"],
  "leads.desc": ["مسار البيع من أول تواصل حتى الإغلاق", "Pipeline from first contact to close"],
  "leads.kanban": ["بطاقات", "Kanban"],
  "leads.table": ["جدول", "Table"],
  "leads.lastCall": ["آخر مكالمة", "Last call"],
  "leads.nextAction": ["الإجراء التالي", "Next action"],
  "leads.moveTo": ["نقل إلى مرحلة", "Move to stage"],
  "leads.noLeads": ["لا يوجد عملاء محتملون", "No leads"],
  "leads.scoreHint": ["يتم حساب درجة الجاهزية تلقائيًا من نتائج المكالمات", "Score is computed automatically from call outcomes"],

  /* ------------------------------ Follow-ups -------------------------------- */
  "follow.title": ["المتابعة", "Follow-ups"],
  "follow.desc": ["مواعيد الاتصال اللاحقة بالعملاء", "Scheduled callbacks with customers"],
  "follow.today": ["مواعيد اليوم", "Due today"],
  "follow.overdue": ["متأخرة", "Overdue"],
  "follow.upcoming": ["قادمة", "Upcoming"],
  "follow.reason": ["السبب", "Reason"],
  "follow.dueAt": ["الموعد", "Due at"],
  "follow.markDone": ["تم التواصل", "Mark done"],
  "follow.cancel": ["إلغاء الموعد", "Cancel"],
  "follow.add": ["موعد متابعة جديد", "New follow-up"],
  "follow.contact": ["العميل", "Customer"],
  "follow.selectContact": ["اختر العميل", "Select customer"],
  "follow.noFollowups": ["لا توجد مواعيد متابعة", "No follow-ups"],
  "follow.overdueToast": ["تم تأجيل الموعد يومًا واحدًا", "Follow-up postponed by one day"],
  "follow.doneToast": ["تم تعليم الموعد كمكتمل", "Follow-up marked as done"],

  /* ------------------------------- Analytics -------------------------------- */
  "analytics.title": ["التحليلات", "Analytics"],
  "analytics.desc": ["أداء المكالمات والحملات والإيجنت", "Call, campaign and agent performance"],
  "analytics.callsPerDay": ["المكالمات اليومية", "Calls per day"],
  "analytics.answerRate": ["معدل الرد", "Answer rate"],
  "analytics.successRate": ["نسبة النجاح", "Success rate"],
  "analytics.interestedLeads": ["عملاء مهتمون", "Interested leads"],
  "analytics.callsByCampaign": ["المكالمات حسب الحملة", "Calls by campaign"],
  "analytics.callsByTime": ["المكالمات حسب الساعة", "Calls by hour"],
  "analytics.avgDuration": ["متوسط المدة", "Average duration"],
  "analytics.funnel": ["مسار التحويل", "Lead conversion funnel"],
  "analytics.objections": ["أسباب الاعتراض الأكثر شيوعًا", "Top objection reasons"],
  "analytics.agentPerf": ["أداء الإيجنت", "Agent performance"],
  "analytics.outcomes": ["توزيع النتائج", "Call outcomes"],
  "analytics.totalCalls": ["إجمالي المكالمات", "Total calls"],
  "analytics.transfers": ["تحويلات لموظف", "Human transfers"],
  "analytics.answeredVsMissed": ["مردودة مقابل غير مردودة", "Answered vs missed"],
  "analytics.callsCount": ["مكالمات", "Calls"],
  "analytics.interestedCount": ["مهتمين", "Interested"],
  "analytics.period": ["الفترة", "Period"],

  /* -------------------------------- Agent ----------------------------------- */
  "agent.title": ["الإيجنت الذكي", "AI Agent"],
  "agent.desc": ["تخصيص سلوك وصوت وشخصية موظف الذكاء الاصطناعي", "Customize your AI phone agent behavior"],
  "agent.configTab": ["إعدادات الإيجنت", "Configuration"],
  "agent.flowTab": ["تدفق المحادثة", "Conversation flow"],
  "agent.basicInfo": ["البيانات الأساسية", "Basic info"],
  "agent.name": ["اسم الإيجنت", "Agent name"],
  "agent.jobTitle": ["وظيفة الإيجنت", "Agent job title"],
  "agent.type": ["نوع الإيجنت", "Agent type"],
  "agent.typeCustomerService": ["خدمة عملاء", "Customer service"],
  "agent.typeSales": ["مبيعات", "Sales"],
  "agent.typeFollowup": ["متابعة", "Follow-up"],
  "agent.typeAppointments": ["حجز مواعيد", "Appointments"],
  "agent.typeCustom": ["مخصص", "Custom"],
  "agent.voice": ["الصوت", "Voice"],
  "agent.voicePlaceholder": [
    "سيتم ربط الصوت بمحرك TTS المحلي لاحقًا",
    "Voice will be connected to your local TTS engine later",
  ],
  "agent.language": ["اللغة واللهجة", "Language & dialect"],
  "agent.langArEg": ["عربي مصري", "Arabic — Egyptian"],
  "agent.langArGulf": ["عربي خليجي", "Arabic — Gulf"],
  "agent.langArMsa": ["عربية فصحى", "Modern Standard Arabic"],
  "agent.langEn": ["إنجليزي", "English"],
  "agent.personality": ["الشخصية", "Personality"],
  "agent.personalityProfessional": ["احترافي", "Professional"],
  "agent.personalityFriendly": ["ودود", "Friendly"],
  "agent.personalityFormal": ["رسمي", "Formal"],
  "agent.personalitySales": ["تركيز على البيع", "Sales-focused"],
  "agent.personalityService": ["تركيز على خدمة العملاء", "Customer-service focused"],
  "agent.systemPrompt": ["التوجيه الأساسي للنموذج (System Prompt)", "System prompt"],
  "agent.systemPromptHint": [
    "يُرسل للنموذج اللغوي المحلي في بداية كل مكالمة",
    "Sent to your local LLM at the start of every call",
  ],
  "agent.greeting": ["رسالة الافتتاح", "Greeting"],
  "agent.closing": ["رسالة الختام", "Closing message"],
  "agent.objectionHandling": ["التعامل مع الاعتراضات", "Objection handling"],
  "agent.transferWhen": ["متى يُحوّل لموظف بشري", "When to transfer to a human"],
  "agent.maxDuration": ["أقصى مدة للمحادثة (دقيقة)", "Max conversation duration (minutes)"],
  "agent.collectInfo": ["المعلومات المسموح جمعها", "Information allowed to collect"],
  "agent.collectInfoHint": ["اكتب العنصر ثم اضغط Enter", "Type an item and press Enter"],
  "agent.neverSay": ["ما يجب ألا يقوله الإيجنت أبدًا", "What the agent must never say"],
  "agent.savedToast": ["تم حفظ إعدادات الإيجنت", "Agent settings saved"],

  /* ------------------------------ Flow builder ------------------------------ */
  "flow.title": ["تدفق المحادثة", "Conversation flow"],
  "flow.desc": [
    "خطوات المحادثة التي ينفذها الإيجنت بالترتيب مع الشروط",
    "Steps the agent executes in order, with conditions",
  ],
  "flow.addStep": ["إضافة خطوة", "Add step"],
  "flow.reset": ["استعادة التدفق الافتراضي", "Restore default flow"],
  "flow.editStep": ["تعديل الخطوة", "Edit step"],
  "flow.stepTitle": ["عنوان الخطوة", "Step title"],
  "flow.stepKind": ["نوع الخطوة", "Step type"],
  "flow.stepPrompt": ["ما يقوله الإيجنت", "What the agent says"],
  "flow.conditions": ["الشروط", "Conditions"],
  "flow.addCondition": ["إضافة شرط", "Add condition"],
  "flow.if": ["إذا", "If"],
  "flow.then": ["فـ", "Then"],
  "flow.kindStart": ["بداية", "Start"],
  "flow.kindMessage": ["رسالة", "Message"],
  "flow.kindQuestion": ["سؤال", "Question"],
  "flow.kindCondition": ["تفرع / شرط", "Condition"],
  "flow.kindAction": ["إجراء", "Action"],
  "flow.kindTransfer": ["تحويل لموظف", "Transfer"],
  "flow.kindEnd": ["نهاية", "End"],
  "flow.moveUp": ["خطوة لأعلى", "Move up"],
  "flow.moveDown": ["خطوة لأسفل", "Move down"],
  "flow.engineNote": [
    "سيقرأ محرك الـ LLM المحلي هذا التدفق أثناء المكالمة ويتفرع حسب الشروط",
    "Your local LLM engine will follow this flow during calls, branching on conditions",
  ],

  /* ---------------------------- Knowledge base ------------------------------ */
  "kb.title": ["قاعدة المعرفة", "Knowledge base"],
  "kb.desc": [
    "معلومات تعتمد عليها الإيجنت أثناء المكالمات",
    "Information the agent retrieves during calls",
  ],
  "kb.add": ["مقال جديد", "New article"],
  "kb.edit": ["تعديل المقال", "Edit article"],
  "kb.articleTitle": ["عنوان المقال", "Article title"],
  "kb.content": ["المحتوى", "Content"],
  "kb.articleType": ["نوع المحتوى", "Content type"],
  "kb.typeText": ["نص", "Text"],
  "kb.typeFaq": ["أسئلة شائعة", "FAQ"],
  "kb.typeFile": ["ملف", "File"],
  "kb.file": ["الملف", "File"],
  "kb.filePlaceholder": [
    "رفع الملفات متاح بعد ربط التخزين (Supabase Storage)",
    "File upload unlocks with storage integration (Supabase Storage)",
  ],
  "kb.faqTitle": ["الأسئلة والأجوبة", "Questions & answers"],
  "kb.addQuestion": ["إضافة سؤال", "Add question"],
  "kb.question": ["السؤال", "Question"],
  "kb.answer": ["الإجابة", "Answer"],
  "kb.categoryAbout": ["عن الشركة", "About the company"],
  "kb.categoryPricing": ["الأسعار والباقات", "Pricing & packages"],
  "kb.categoryProducts": ["المنتجات", "Products"],
  "kb.categoryPolicies": ["السياسات", "Policies"],
  "kb.categoryRegistration": ["التسجيل", "Registration"],
  "kb.categoryFaq": ["أسئلة شائعة", "FAQ"],
  "kb.linked": ["مرتبط بالحملات", "Linked to campaigns"],
  "kb.active": ["مفعّل", "Active"],
  "kb.inactive": ["متوقف", "Inactive"],
  "kb.noArticles": ["قاعدة المعرفة فارغة", "Knowledge base is empty"],
  "kb.noArticlesDesc": ["أضف أول مقال ليستخدمه الإيجنت في المكالمات", "Add the first article for the agent to use"],
  "kb.searchPlaceholder": ["ابحث في المقالات…", "Search articles…"],
  "kb.words": ["كلمة", "words"],

  /* -------------------------------- Settings -------------------------------- */
  "settings.title": ["الإعدادات", "Settings"],
  "settings.desc": ["تهيئة النظام للربط مع الخوادم الخاصة بك", "Configure the system for your self-hosted backend"],
  "settings.tabGeneral": ["عام", "General"],
  "settings.tabTelephony": ["الهاتفية", "Telephony"],
  "settings.tabAI": ["نماذج الذكاء الاصطناعي", "AI Models"],
  "settings.tabSTT": ["التعرف على الكلام", "Speech-to-Text"],
  "settings.tabTTS": ["تحويل النص لكلام", "Text-to-Speech"],
  "settings.tabDatabase": ["قاعدة البيانات", "Database"],
  "settings.tabTransfer": ["التحويل لموظف", "Human Transfer"],
  "settings.tabSecurity": ["الأمان", "Security"],
  "settings.tabNotifications": ["الإشعارات", "Notifications"],
  "settings.appName": ["اسم التطبيق", "Application name"],
  "settings.timezone": ["المنطقة الزمنية", "Timezone"],
  "settings.dangerZone": ["منطقة الخطر", "Danger zone"],
  "settings.resetDemo": ["استعادة البيانات التجريبية", "Restore demo data"],
  "settings.resetDemoDesc": [
    "يعيد جميع بيانات العرض إلى الحالة الأصلية",
    "Resets all demo data to its original state",
  ],
  "settings.resetDemoConfirm": [
    "سيتم حذف كل التغييرات واستعادة البيانات التجريبية. هل تريد المتابعة؟",
    "All changes will be lost and demo data restored. Continue?",
  ],
  "settings.resetDone": ["تمت استعادة البيانات التجريبية", "Demo data restored"],
  "settings.provider": ["المزود", "Provider"],
  "settings.providerMock": ["محاكاة (للتطوير)", "Mock (development)"],
  "settings.providerAsterisk": ["Asterisk (مستقبلًا)", "Asterisk (future)"],
  "settings.telephonyNote": [
    "حقول عامة جاهزة لأي مزود هاتفية ذاتي الاستضافة — لا يتم إرسالها لأي طرف ثالث",
    "Generic fields ready for any self-hosted telephony backend — never sent to third parties",
  ],
  "settings.backendUrl": ["رابط مزود الهاتفية", "Telephony backend URL"],
  "settings.wsUrl": ["رابط WebSocket", "WebSocket URL"],
  "settings.apiUrl": ["رابط الـ API", "API URL"],
  "settings.apiSecret": ["المفتاح السري للـ API", "API secret"],
  "settings.statusEndpoint": ["رابط حالة الإيجنت", "Agent status endpoint"],
  "settings.callEndpoint": ["رابط بدء المكالمة", "Call endpoint"],
  "settings.hangupEndpoint": ["رابط إنهاء المكالمة", "Hangup endpoint"],
  "settings.transferEndpoint": ["رابط تحويل المكالمة", "Transfer endpoint"],
  "settings.llmProvider": ["مزود النموذج اللغوي", "LLM provider"],
  "settings.llmOllama": ["Ollama محلي", "Ollama (local)"],
  "settings.llmCustom": ["نموذج مخصص ذاتي الاستضافة", "Custom self-hosted"],
  "settings.llmBaseUrl": ["رابط الخادم", "Server URL"],
  "settings.llmModel": ["اسم النموذج", "Model name"],
  "settings.temperature": ["درجة الإبداع (Temperature)", "Temperature"],
  "settings.maxTokens": ["أقصى عدد التوكنات", "Max tokens"],
  "settings.sttProvider": ["محرك التعرف على الكلام", "STT engine"],
  "settings.sttWhisper": ["Whisper.cpp محلي", "Whisper.cpp (local)"],
  "settings.sttVosk": ["Vosk محلي", "Vosk (local)"],
  "settings.sttModel": ["الموديل", "Model"],
  "settings.sttLanguage": ["لغة التعرف", "Recognition language"],
  "settings.ttsProvider": ["محرك تحويل النص لكلام", "TTS engine"],
  "settings.ttsLocal": ["محرك عربي محلي", "Local Arabic engine"],
  "settings.ttsVoice": ["الصوت", "Voice"],
  "settings.ttsSpeed": ["سرعة الكلام", "Speech speed"],
  "settings.supabaseUrl": ["رابط Supabase", "Supabase URL"],
  "settings.supabaseAnonKey": ["مفتاح Anon", "Anon key"],
  "settings.dbNote": [
    "الأسرار تُحفظ في الخادم فقط ولا تُخزن في كود الواجهة",
    "Secrets live server-side only — never embedded in frontend code",
  ],
  "settings.supportPhone": ["رقم خدمة العملاء", "Support phone"],
  "settings.salesPhone": ["رقم المبيعات", "Sales phone"],
  "settings.fallbackPhone": ["رقم الطوارئ البديل", "Fallback phone"],
  "settings.transferRules": ["قواعد التحويل", "Transfer rules"],
  "settings.transferRulesHint": [
    "مثال: إذا تجاوزت درجة الجاهزية 80 وطلب العميل الشراء → تحويل للمبيعات",
    "Example: if lead score > 80 and customer asks to buy → transfer to sales",
  ],
  "settings.addRule": ["إضافة قاعدة", "Add rule"],
  "settings.ruleCondition": ["الشرط", "Condition"],
  "settings.ruleDestination": ["جهة التحويل", "Destination"],
  "settings.destSales": ["المبيعات", "Sales"],
  "settings.destSupport": ["خدمة العملاء", "Support"],
  "settings.destFallback": ["البديل", "Fallback"],
  "settings.sessionTimeout": ["مدة انتهاء الجلسة (دقائق)", "Session timeout (minutes)"],
  "settings.require2fa": ["تفعيل التحقق بخطوتين", "Require two-factor authentication"],
  "settings.onCallCompleted": ["إشعار عند اكتمال المكالمة", "Notify when a call completes"],
  "settings.onLeadTransferred": ["إشعار عند تحويل عميل لموظف", "Notify when a lead is transferred"],
  "settings.onFollowUpDue": ["إشعار عند حلول موعد متابعة", "Notify when a follow-up is due"],
  "settings.dailySummary": ["ملخص يومي بالبريد", "Daily summary email"],
  "settings.saved": ["تم حفظ الإعدادات", "Settings saved"],

  /* -------------------------------- Toasts ---------------------------------- */
  "toast.dndOn": ["تم تعليم الرقم: عدم الاتصال مرة أخرى", "Number marked as do-not-call"],
  "toast.dndOff": ["تم رفع حجب الاتصال", "Do-not-call removed"],
  "toast.agentStarted": ["الإيجنت يعمل الآن — سيبدأ الاتصال من قائمة الانتظار", "Agent started — dialing from the queue"],
  "toast.agentPaused": ["تم إيقاف الإيجنت مؤقتًا", "Agent paused"],
  "toast.agentStopped": ["تم إيقاف الإيجنت", "Agent stopped"],
  "toast.callEnded": ["تمت إنهاء المكالمة التجريبية", "Simulated call ended"],
  "toast.queued": ["تمت إضافة العميل إلى قائمة الانتظار", "Customer added to the call queue"],
  "toast.copied": ["تم النسخ", "Copied"],
  "toast.exported": ["تم تصدير الملف", "File exported"],
  "toast.loginSuccess": ["مرحبًا بك مجددًا", "Welcome back"],
  "toast.soon": ["هذه الميزة متاحة بعد ربط الخادم", "Available once the backend is connected"],

  /* ==================== Voxora AI — Ops modules (feat/ops-integration) ==================== */
  /* nav */
  "nav.group.ops": ["المبيعات والعمليات", "Sales & Ops"],
  "nav.sales": ["المبيعات", "Sales"],
  "nav.pipeline": ["خط المبيعات والتوزيع", "Pipeline & Distribution"],
  "nav.unclaimed": ["الأنشطة غير المرتبطة", "Unclaimed Businesses"],
  "nav.mergeReview": ["مراجعة الدمج", "Merge Review"],
  "nav.botQueue": ["طابور البوت", "AI Bot Queue"],
  "nav.whatsapp": ["واتساب", "WhatsApp"],
  "nav.performance": ["أداء المبيعات", "Sales performance"],
  "nav.audit": ["سجل التدقيق", "Audit Log"],

  /* generic ops */
  "ops.loading": ["جارٍ التحميل…", "Loading…"],
  "ops.errorLoad": ["تعذر تحميل البيانات من الخادم", "Failed to load data from server"],
  "ops.retry": ["إعادة المحاولة", "Retry"],
  "ops.search": ["بحث…", "Search…"],
  "ops.searchPhoneOrName": ["ابحث برقم الهاتف أو الاسم…", "Search by phone or name…"],
  "ops.save": ["حفظ", "Save"],
  "ops.cancel": ["إلغاء", "Cancel"],
  "ops.confirm": ["تأكيد", "Confirm"],
  "ops.close": ["إغلاق", "Close"],
  "ops.demoMode": ["وضع المحاكاة — بدون اتصالات حقيقية", "Simulation mode — no real calls"],
  "ops.phone": ["رقم الهاتف", "Phone"],
  "ops.customer": ["العميل", "Customer"],
  "ops.business": ["النشاط", "Business"],
  "ops.agent": ["الموظف", "Agent"],
  "ops.priority": ["الأولوية", "Priority"],
  "ops.status": ["الحالة", "Status"],
  "ops.lastActivity": ["آخر نشاط", "Last activity"],
  "ops.actions": ["إجراءات", "Actions"],
  "ops.registered": ["مسجل في دليلي", "Registered in Daleely"],
  "ops.notRegistered": ["غير مسجل", "Not registered"],
  "ops.openLead": ["فتح العميل", "Open lead"],
  "ops.minutesAgo": ["قبل دقائق", "minutes ago"],

  /* sales workspace */
  "sales.desc": ["مساحة عمل موظف المبيعات: العملاء المعينون، نتائج التواصل، والمتابعات", "Sales workspace: assigned leads, contact outcomes, and follow-ups"],
  "sales.myLeads": ["عملائي", "My leads"],
  "sales.allAgents": ["كل الموظفين", "All agents"],
  "sales.todayCalls": ["تواصلات اليوم", "Today's contacts"],
  "sales.callbacks": ["رجوع مجدول", "Callbacks"],
  "sales.interested": ["مهتم", "Interested"],
  "sales.notInterested": ["غير مهتم", "Not interested"],
  "sales.newLeads": ["عملاء جدد", "New leads"],
  "sales.linkedBusinesses": ["أنشطة مرتبطة", "Linked businesses"],
  "sales.transferLead": ["تحويل العميل", "Transfer lead"],
  "sales.transferTo": ["تحويل إلى", "Transfer to"],
  "sales.logCall": ["تسجيل نتيجة التواصل", "Log contact outcome"],
  "sales.outcome.busy": ["مشغول", "Busy"],
  "sales.outcome.no_answer": ["لم يجب", "No answer"],
  "sales.outcome.switched_off": ["الجهاز مغلق", "Switched off"],
  "sales.outcome.invalid_number": ["رقم غير صحيح", "Invalid number"],
  "sales.outcome.out_of_service": ["خارج الخدمة", "Out of service"],
  "sales.outcome.interested": ["مهتم", "Interested"],
  "sales.outcome.not_interested": ["غير مهتم", "Not interested"],
  "sales.outcome.callback": ["رجوع لاحقًا", "Callback"],
  "sales.outcome.linked": ["تم الربط", "Linked"],
  "sales.outcome.whatsapp_followup": ["متابعة واتساب", "WhatsApp follow-up"],
  "sales.outcome.closed_business": ["نشاط مغلق", "Closed business"],
  "sales.outcome.new": ["جديد", "New"],
  "sales.outcome.assigned": ["معين لموظف", "Assigned"],
  "sales.outcome.queued": ["في طابور البوت", "Queued for AI Bot"],
  "sales.outcome.calling": ["جارٍ الاتصال", "Calling"],
  "sales.outcome.answered": ["تم الرد", "Answered"],
  "sales.outcome.completed": ["مكتمل", "Completed"],
  "sales.outcome.failed": ["فاشل", "Failed"],
  "sales.outcome.transferred_to_sales": ["تم تحويله لموظف", "Transferred to sales"],
  "sales.addNote": ["إضافة ملاحظة", "Add note"],
  "sales.notePlaceholder": ["اكتب ملاحظة عن العميل…", "Write a note about the lead…"],
  "sales.scheduleCallback": ["جدولة رجوع", "Schedule callback"],
  "sales.callbackDate": ["تاريخ ووقت الرجوع", "Callback date & time"],
  "sales.callbackReason": ["سبب الرجوع", "Callback reason"],
  "sales.sendWhatsapp": ["فتح واتساب للمتابعة", "Open WhatsApp follow-up"],
  "sales.whatsappBody": ["نص رسالة المتابعة", "Follow-up message body"],
  "sales.addToBot": ["إضافة إلى البوت", "Add to AI Bot"],
  "sales.addedToBot": ["تمت الإضافة إلى طابور البوت — ملكية المبيعات محفوظة", "Added to bot queue — sales ownership preserved"],
  "sales.linkOwner": ["ربط بصاحب النشاط", "Link owner"],
  "sales.linkOwnerDesc": ["اختر النشاط غير المرتبط المراد ربطه بهذا العميل", "Choose the unclaimed business to link to this lead"],
  "sales.confirmBusinessStatus": ["تأكيد حالة النشاط", "Confirm business status"],
  "sales.confirmClosed": ["تأكيد إغلاق نهائي للنشاط", "Confirm business permanently closed"],
  "sales.confirmInvalidPhone": ["تأكيد رقم غير صحيح", "Confirm invalid phone"],
  "sales.reasonLabel": ["السبب", "Reason"],
  "sales.confidence": ["درجة التأكيد %", "Confidence %"],
  "sales.visibilityNote": ["ملاحظة: المكالمات غير المستجابة لا تخفي النشاط — التغيير يتطلب تأكيدًا موثقًا فقط", "Note: unanswered calls never hide a business — only documented confirmation changes visibility"],
  "sales.leadTimeline": ["الخط الزمني الموحد", "Unified timeline"],
  "sales.callsHistory": ["سجل التواصل", "Contact history"],
  "sales.notesHistory": ["الملاحظات", "Notes"],
  "sales.notesSource": ["المصدر", "Source"],
  "sales.actor.admin": ["الإدارة", "Admin"],
  "sales.actor.sales_agent": ["موظف مبيعات", "Sales agent"],
  "sales.actor.ai_agent": ["AI Bot", "AI Bot"],
  "sales.actor.system": ["النظام", "System"],
  "sales.actor.customer": ["العميل", "Customer"],
  "sales.noLeads": ["لا يوجد عملاء معينون بعد", "No assigned leads yet"],
  "sales.markOutcomeToast": ["تم حفظ نتيجة الاتصال", "Call outcome saved"],

  /* pipeline & distribution */
  "pipeline.desc": ["دخول تلقائي لخط المبيعات وتوزيع عادل لكل بادئة (010/011/012/015)", "Auto pipeline entry with fair per-prefix distribution"],
  "pipeline.totalLeads": ["إجمالي العملاء", "Total leads"],
  "pipeline.distribution": ["توزيع العملاء", "Lead distribution"],
  "pipeline.fairness": ["التوازن", "Balance"],
  "pipeline.prefix": ["البادئة", "Prefix"],
  "pipeline.addEmployee": ["إضافة موظف", "Add employee"],
  "pipeline.employeeName": ["اسم الموظف", "Employee name"],
  "pipeline.employeeRole": ["الدور", "Role"],
  "pipeline.employeePhone": ["هاتف الموظف", "Employee phone"],
  "pipeline.disable": ["تعطيل", "Disable"],
  "pipeline.activate": ["تنشيط", "Activate"],
  "pipeline.reassign": ["إعادة توزيع العملاء المفتوحة", "Reassign open leads"],
  "pipeline.reassignedToast": ["تمت إعادة التوزيع بأمان — السجل محفوظ", "Reassigned safely — history preserved"],
  "pipeline.disabledToast": ["تم تعطيل الموظف وإعادة توزيع عملائه المفتوحة", "Employee disabled and open leads reassigned"],
  "pipeline.roleChanged": ["تم تحديث الدور", "Role updated"],
  "pipeline.employeeAdded": ["تمت إضافة الموظف", "Employee added"],
  "pipeline.leadsCount": ["عملاء نشطون", "Active leads"],
  "pipeline.autoEntry": ["أي رقم يُضاف من الإدارة يدخل الخط تلقائيًا", "Any phone added by Admin enters the pipeline automatically"],
  "pipeline.tryAdd": ["إضافة رقم سريع", "Quick add phone"],

  /* unclaimed */
  "unclaimed.desc": ["كل الأنشطة التي لا تربطها علاقة مؤكدة بمالك/حساب", "All businesses without a confirmed owner/account relationship"],
  "unclaimed.title": ["الأنشطة غير المرتبطة", "Unclaimed businesses"],
  "unclaimed.ownerCandidate": ["مرشح للملكية", "Owner candidate"],
  "unclaimed.matchScore": ["نسبة التطابق", "Match score"],
  "unclaimed.matchReason": ["سبب التطابق", "Match reason"],
  "unclaimed.link": ["ربط", "Link"],
  "unclaimed.reject": ["رفض المطابقة", "Reject match"],
  "unclaimed.chooseOther": ["اختيار نشاط آخر", "Choose another business"],
  "unclaimed.linkedToast": ["تم ربط النشاط بنجاح", "Business linked successfully"],
  "unclaimed.rejectedToast": ["تم رفض المطابقة وتسجيل القرار", "Match rejected and logged"],
  "unclaimed.mergeDup": ["دمج مكرر", "Merge duplicate"],
  "unclaimed.openBusiness": ["فتح النشاط", "Open business"],
  "unclaimed.openCustomer": ["فتح العميل", "Open customer"],
  "unclaimed.lastContact": ["آخر تواصل", "Last contact"],
  "unclaimed.category": ["التصنيف", "Category"],
  "unclaimed.location": ["الموقع", "Location"],
  "unclaimed.filterAll": ["غير المرتبطة", "Unclaimed"],
  "unclaimed.filterHidden": ["المخفية/المعلقة", "Hidden/Suspended"],
  "unclaimed.filterClosed": ["المغلقة", "Closed"],
  "unclaimed.filterInvalid": ["أرقام غير صالحة", "Invalid phones"],
  "unclaimed.filterMerged": ["المدمجة", "Merged"],
  "unclaimed.restore": ["استرجاع النشاط", "Restore business"],
  "unclaimed.restoredToast": ["تم استرجاع النشاط وإتاحته مجددًا", "Business restored and public again"],

  /* merge review */
  "merge.desc": ["مراجعة الأنشطة المكررة قبل أي دمج — لا دمج تلقائي للثقة المتوسطة", "Review duplicate businesses before merging — never auto-merge low confidence"],
  "merge.title": ["مراجعة الدمج", "Merge review"],
  "merge.canonical": ["النشاط الأصلي (المرجعي)", "Canonical listing"],
  "merge.duplicate": ["النشاط الجديد (المكرر)", "New submission"],
  "merge.confidence": ["درجة الثقة", "Confidence"],
  "merge.reasons": ["أسباب التطابق", "Match reasons"],
  "merge.actionMerge": ["دمج", "Merge"],
  "merge.actionReject": ["رفض المطابقة", "Reject match"],
  "merge.actionManual": ["مراجعة يدوية", "Manual review"],
  "merge.actionLinkOwner": ["ربط صاحب النشاط", "Link owner"],
  "merge.openBoth": ["فتح النشاطين", "Open both listings"],
  "merge.fieldChanges": ["التغييرات المطبقة", "Applied changes"],
  "merge.keptExisting": ["أُبقي الموجود", "Kept existing"],
  "merge.filledFromNew": ["أُضيف من الجديد", "Filled from new"],
  "merge.appended": ["أُلحقت صور/بيانات", "Appended"],
  "merge.mergedToast": ["تم الدمج الآمن — النشاط الأصلي محفوظ والمكرر موسوم", "Merged safely — canonical preserved, duplicate marked"],
  "merge.noPending": ["لا توجد مراجعات معلقة", "No pending reviews"],
  "merge.history": ["سجل الدمج", "Merge history"],
  "merge.pending": ["قيد المراجعة", "Pending review"],
  "merge.fieldAddress": ["العنوان", "Address"],
  "merge.status.auto_merged": ["دمج تلقائي (ثقة عالية)", "Auto-merged (high confidence)"],
  "merge.status.merged": ["تم الدمج", "Merged"],
  "merge.status.rejected": ["مرفوض", "Rejected"],
  "merge.status.manual_review": ["مراجعة يدوية", "Manual review"],

  /* bot queue */
  "bot.desc": ["طابور AI Bot — الملكية الأصلية للموظف محفوظة والنتيجة تعود لنفس العميل", "AI Bot queue — original sales ownership preserved, results return to the same lead"],
  "bot.title": ["طابور AI Bot", "AI Bot queue"],
  "bot.customer": ["العميل", "Customer"],
  "bot.salesOwner": ["موظف المبيعات الأصلي", "Original sales owner"],
  "bot.attempts": ["المحاولات", "Attempts"],
  "bot.scheduled": ["الموعد", "Scheduled"],
  "bot.lastResult": ["آخر نتيجة", "Last result"],
  "bot.start": ["بدء", "Start"],
  "bot.pause": ["إيقاف مؤقت", "Pause"],
  "bot.resume": ["استئناف", "Resume"],
  "bot.remove": ["إزالة", "Remove"],
  "bot.prioritize": ["ترقية الأولوية", "Prioritize"],
  "bot.returnToSales": ["إرجاع للمبيعات", "Return to sales"],
  "bot.empty": ["الطابور فارغ", "Queue is empty"],
  "bot.removeConfirm": ["إزالة العميل من طابور البوت؟", "Remove this lead from the bot queue?"],
  "bot.status.queued": ["في الانتظار", "Queued"],
  "bot.status.running": ["جارٍ المعالجة (محاكاة)", "Processing (simulated)"],
  "bot.status.paused": ["متوقف مؤقتًا", "Paused"],
  "bot.status.done": ["اكتمل", "Done"],
  "bot.status.returned": ["أعيد للمبيعات", "Returned"],

  /* whatsapp */
  "wa.desc": ["صندوق واتساب مرتبط بنفس العملاء — لا إدارة منفصلة", "WhatsApp inbox attached to the same leads — no separate CRM"],
  "wa.title": ["واتساب", "WhatsApp"],
  "wa.threads": ["المحادثات", "Threads"],
  "wa.selectThread": ["اختر محادثة لعرضها", "Select a thread to view"],
  "wa.writeMessage": ["اكتب رسالة…", "Write a message…"],
  "wa.send": ["إرسال", "Send"],
  "wa.templates": ["قوالب", "Templates"],
  "wa.simulateReply": ["محاكاة رد العميل", "Simulate customer reply"],
  "wa.status.queued": ["في الانتظار", "Queued"],
  "wa.status.sent": ["أُرسلت", "Sent"],
  "wa.status.delivered": ["وصلت", "Delivered"],
  "wa.status.read": ["قُرئت", "Read"],
  "wa.status.failed": ["فشلت", "Failed"],
  "wa.status.received": ["مستلمة", "Received"],
  "wa.salesOwner": ["موظف المبيعات", "Sales owner"],
  "wa.linkedLead": ["العميل المرتبط", "Linked lead"],
  "wa.empty": ["لا توجد محادثات بعد", "No threads yet"],
  "wa.sentToast": ["تم تسجيل المتابعة وفتح واتساب", "Follow-up logged and WhatsApp opened"],

  /* performance */
  "perf.desc": ["مقارنة أداء فريق المبيعات مع AI Bot", "Compare sales team performance against the AI Bot"],
  "perf.title": ["الأداء", "Performance"],
  "perf.calls": ["الاتصالات", "Calls"],
  "perf.answered": ["تم الرد", "Answered"],
  "perf.interested": ["مهتمون", "Interested"],
  "perf.followups": ["متابعات", "Follow-ups"],
  "perf.linked": ["أنشطة مرتبطة", "Linked businesses"],
  "perf.conversion": ["نسبة التحويل", "Conversion rate"],
  "perf.salesTeam": ["فريق المبيعات", "Sales team"],
  "perf.aiAgent": ["AI Bot", "AI Bot"],

  /* audit */
  "audit.desc": ["كل عملية مهمة مسجلة — لا تغييرات صامتة", "Every important operation is logged — no silent changes"],
  "audit.title": ["سجل التدقيق", "Audit log"],
  "audit.records": ["سجل", "records"],
  "audit.metadata": ["بيانات إضافية", "Metadata"],
  "audit.actor": ["الفاعل", "Actor"],
  "audit.action": ["الإجراء", "Action"],
  "audit.entity": ["الكيان", "Entity"],
  "audit.when": ["الوقت", "When"],
  "audit.details": ["التفاصيل", "Details"],
  "audit.old": ["قبل", "Before"],
  "audit.new": ["بعد", "After"],
  "audit.reason": ["السبب", "Reason"],
  "audit.actorType.all": ["الكل", "All"],
  "audit.empty": ["لا توجد سجلات مطابقة", "No matching records"],

  /* overview */
  "overview.pendingMerges": ["مراجعات دمج معلقة", "Pending merge reviews"],
  "overview.unclaimed": ["أنشطة غير مرتبطة", "Unclaimed businesses"],
  "overview.botQueued": ["في طابور البوت", "In bot queue"],
};

interface I18nContextValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** "اليوم 14:35" / "Today 14:35" */
  fmtDateTime: (d: string | Date | null | undefined) => string;
  fmtDate: (d: string | Date | null | undefined) => string;
  fmtTime: (d: string | Date | null | undefined) => string;
  fmtDay: (d: string | Date | null | undefined) => string;
  /** 0:45 / 12:05 */
  fmtDuration: (sec: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const TZ = "Africa/Cairo";

function makeFormatters(lang: Lang) {
  const locale = lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const dateTime = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const wrap =
    (fmt: Intl.DateTimeFormat) =>
    (d: string | Date | null | undefined): string => {
      if (!d) return "—";
      const parsed = typeof d === "string" ? new Date(d) : d;
      if (Number.isNaN(parsed.getTime())) return "—";
      return fmt.format(parsed);
    };
  return {
    fmtDateTime: wrap(dateTime),
    fmtDate: wrap(date),
    fmtTime: wrap(time),
    fmtDay: wrap(day),
  };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    // Deferred so SSR output stays stable; storage is a client-only system.
    const t = window.setTimeout(() => {
      const stored = window.localStorage.getItem("sc-lang") as Lang | null;
      if (stored === "ar" || stored === "en") setLangState(stored);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("sc-lang", l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const entry = DICT[key];
      let out = entry ? entry[lang === "ar" ? 0 : 1] : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return out;
    },
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      t,
      ...makeFormatters(lang),
      fmtDuration: (sec: number) => {
        const s = Math.max(0, Math.floor(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
      },
    }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
