<div dir="rtl">

# Voxora AI — منصة المبيعات وعمليات العملاء

**Repository:** `voxora-ai-ops`

منصة مستقلة وقابلة لإعادة الاستخدام لإدارة المبيعات وخدمة العملاء عبر البشر والـAI. دليلي هو أول تكامل فعلي للمنصة، لكنه معزول داخل طبقة Integration ولا يتم تضمين منطق دليلي داخل نواة Voxora.

النسخة الحالية متصلة معماريًا بقاعدة Supabase الحقيقية لدليلي، وتدعم: Leads، فريق المبيعات، الأنشطة غير المستلمة، ربط المالك، الدمج الآمن للمكرر، حالات المكالمات، المتابعات، Bot Queue، WhatsApp Queue، Timeline وAudit Log.

> **مهم:** قاعدة البيانات وطبقة الـAPI حقيقية. المكالمة الهاتفية الفعلية تحتاج تشغيل الـLocal Telephony Bridge (Asterisk + شريحة/SIM) على جهاز مخصص وربطه عبر `TELEPHONY_BACKEND_URL`. لا يتم ادعاء إجراء مكالمة فعلية قبل تشغيل هذا الـBridge.

</div>

## Architecture

```text
Daleely Web / App (existing, remains independent)
        │
        ├── Existing Supabase (source of truth)
        │       ├── listings / user_profiles / notifications
        │       └── voxora_* operational tables
        │
        └── Voxora AI (this repository)
                ├── Auth + server-only Supabase integration
                ├── Sales / Leads / Owner Linking / Duplicate Merge
                ├── AI Bot Queue / WhatsApp Queue / Audit
                ├── TelephonyProvider
                │       ├── mock (local UI development)
                │       └── asterisk (real backend bridge)
                └── Local AI adapters
                        ├── Ollama / Qwen
                        ├── Whisper.cpp
                        └── Piper Arabic TTS
```

Voxora is deliberately independent: if Voxora is offline, Daleely's public website and app continue to run normally.

## Production data model

The production integration uses the **existing Daleely Supabase project**. It does not create a second Daleely database.

Voxora adds only prefixed operational tables such as:

- `voxora_sales_agents`
- `voxora_leads`
- `voxora_lead_listings`
- `voxora_call_attempts`
- `voxora_followups`
- `voxora_bot_queue`
- `voxora_whatsapp_threads`
- `voxora_whatsapp_messages`
- `voxora_timeline_events`
- `voxora_audit_logs`
- `voxora_owner_link_events`
- `voxora_listing_state`
- `voxora_merge_jobs`

Existing Daleely tables are not dropped or renamed.

### Safety rules

- No automated hard-delete of a Daleely listing.
- `busy`, `no_answer` and `switched_off` are call states only and never hide a business.
- Only strong confirmed states such as `closed_business`, `invalid_phone`, `out_of_service` or `wrong_business_phone` may hide a listing, and the previous visibility is stored for restore.
- Duplicate listings are merged into a canonical listing and the duplicate is hidden/reversible instead of deleted.
- A duplicate merge can append useful images and fill missing address/contact/social/work-hours fields without blindly overwriting populated canonical fields.
- Successful linking/merge uses the positive notification: `تم ربط نشاطك بحسابك بنجاح وتم تحديث بيانات النشاط`.
- A single phone lead can be related to multiple activities through `voxora_lead_listings`.
- Every important mutation is written to `voxora_audit_logs`.

## Automatic sales entry and fair distribution

A trigger on Daleely `listings` watches newly added or updated unclaimed activities with a valid Egyptian mobile number.

Flow:

```text
listing phone
  → normalize (010 / +2010 / 002010 → one canonical form)
  → deduplicate lead by normalized phone
  → attach all matching activities to the same lead
  → match registered Daleely user when possible
  → assign to an active Sales seat
```

Assignment is deterministic and balances **each mobile prefix first**, then the total workload. That prevents one employee receiving most `010` numbers while the other receives most `011` numbers.

The two initial seats are configuration/data, not hardcoded product limits. They can be disabled/replaced and historical activity remains intact.

## Duplicate detection

New Daleely listings are checked automatically:

- **Exact normalized phone + exact normalized business name:** strong enough for automatic safe merge.
- **Exact name + same area without the phone signal:** creates a pending merge review only; it is **not** auto-merged.
- Lower-confidence matches remain manual review candidates.

This is intentionally conservative so two different businesses belonging to the same person/phone are not incorrectly merged.

## Authentication

Production login uses **Daleely Supabase Auth**.

Access is granted only when the signed-in user is either:

- an active Daleely admin (`public.admins`), or
- linked to an active `voxora_sales_agents` record.

The Supabase secret key is server-only. The browser receives only the publishable key and an HTTP-only session cookie.

## API

Operational data is exposed only through Voxora's server routes:

```text
/api/auth/login
/api/auth/logout
/api/auth/session
/api/ops/*
/api/ai/chat
/api/ai/health
/api/telephony/bridge
/api/telephony/health
/api/integrations/daleely/health
/api/health
```

`/api/ops/*`, AI chat and telephony mutations require an authorized Voxora session in production.

## Telephony

`src/services/telephony/index.ts` defines the provider-independent contract.

- `MockTelephonyProvider` is only for local UI development.
- `AsteriskTelephonyProvider` already calls the protected Voxora server bridge.
- `/api/telephony/bridge` proxies to a self-hosted telephony backend configured by `TELEPHONY_BACKEND_URL`.

The expected backend endpoints are documented in `local-stack/README.md`.

## Local AI

Recommended self-hosted defaults:

- LLM: Ollama + `qwen3:4b`
- STT: Whisper.cpp server
- TTS: Piper Arabic voice (default config `ar_JO-kareem-medium`)

These run outside the Vercel web process. Configure their reachable URLs through environment variables.

## Environment

Copy `.env.example` to `.env.local`. Never commit secrets.

Production essentials:

```text
NEXT_PUBLIC_DALEELY_ADAPTER=supabase
DALEELY_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<server-only-secret>
DALEELY_LISTINGS_TABLE=listings
DALEELY_USERS_TABLE=user_profiles
```

For local phone/AI integration:

```text
TELEPHONY_BACKEND_URL=http://<local-bridge>:8099
TELEPHONY_API_SECRET=<bridge-shared-secret>
LLM_URL=http://<ollama-host>:11434
LLM_MODEL=qwen3:4b
ASR_URL=http://<whisper-host>:8090
TTS_URL=http://<piper-host>:8091
TTS_VOICE=ar_JO-kareem-medium
```

## Database SQL

Production-safe SQL is kept under `supabase/`:

- `voxora-production.sql` — core Voxora production tables/functions/automation.
- `voxora-production-extensions.sql` — lead↔multiple-listing support, hardened search paths and conservative duplicate detection.
- `ops-schema.sql` — **legacy/local design reference only; do not apply to Daleely production**.
- `schema.sql` — original builder/demo schema reference.

The live Daleely database should be changed through reviewed migrations, not by pasting old demo schemas.

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

The repository still contains a local/mock mode so the UI can be developed without production credentials. This mode is clearly separate from the Supabase production adapter.

## Verification checklist

Before merging a production change verify:

1. Supabase auth rejects unauthorised users.
2. Lead auto-entry and per-prefix distribution still balance active Sales seats.
3. Same number can attach to multiple listings without duplicate leads.
4. Busy/no-answer/switched-off do not hide a listing.
5. Confirmed closed/invalid state hides reversibly and writes an audit row.
6. Owner link updates the canonical Daleely listing and sends only the positive linking notification.
7. Exact duplicate merge enriches the canonical record and hides the duplicate without hard-delete.
8. Bot queue preserves the original sales owner.
9. WhatsApp events remain attached to the same lead/timeline.
10. Voxora failure does not block Daleely public traffic.

<div dir="rtl">

© 2026 Voxora AI — دليلي هو أول تكامل، وليس جزءًا ثابتًا من هوية المنتج.

</div>
