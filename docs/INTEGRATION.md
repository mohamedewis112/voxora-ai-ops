# Voxora AI — Integration Guide

## Production boundary

Voxora is a separate Next.js application. Daleely remains the source of truth in its existing Supabase project. Production access goes through server-only routes in Voxora; the browser never receives the Supabase secret key.

```text
Browser
  → Voxora Next.js API (authorized session)
      → Daleely Supabase REST/RPC (server secret)
      → Telephony bridge (shared secret)
      → Ollama / Whisper.cpp / Piper services
```

## Supabase

Production uses the actual Daleely tables `listings`, `user_profiles`, `admins`, `notifications`, plus isolated `voxora_*` tables.

Apply reviewed SQL from:

1. `supabase/voxora-production.sql`
2. `supabase/voxora-production-extensions.sql`

Do **not** apply `supabase/ops-schema.sql` to Daleely production; it is kept only as an earlier local/reference design.

## Authentication

`/api/auth/login` signs into Daleely Supabase Auth and stores the access token in an HTTP-only cookie. `requireVoxoraActor()` validates the token and checks either `public.admins` or an active `voxora_sales_agents` row.

## Telephony

The UI calls `TelephonyProvider`; it never calls Asterisk directly.

Production flow:

```text
UI → /api/telephony/bridge → TELEPHONY_BACKEND_URL → Asterisk/ARI
```

`AsteriskTelephonyProvider` is already wired to the bridge for:

- agent start/pause/stop/status
- originate call
- hang up
- transfer
- transcript fetch
- recording fetch

A local bridge implementation must expose the endpoints documented in `local-stack/README.md`.

## AI

`/api/ai/chat` is authenticated and proxies to Ollama's `/api/chat` endpoint. Default model: `qwen3:4b`.

The future real-time voice worker should combine:

```text
Asterisk audio
→ Whisper.cpp STT
→ Voxora conversation state / knowledge
→ Ollama LLM
→ Piper TTS
→ Asterisk audio bridge
```

The web app already keeps ASR, LLM and TTS URLs provider-independent in server environment config.

## WhatsApp

WhatsApp records live in the same Lead/Timeline model. Current production architecture is provider-agnostic. `WHATSAPP_PROVIDER=mock` must remain until a real official adapter and credentials are configured.

## Safety

- Never hard-delete Daleely listings from Voxora automation.
- Never hide a business on `busy`, `no_answer` or `switched_off` alone.
- Strong closure/invalid-number state is reversible and audited.
- Duplicate auto-merge requires exact normalized phone + exact normalized name; ambiguous matches go to review.
- Do-not-contact decisions must be preserved when the telephony worker is enabled.
