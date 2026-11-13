# Voxora local AI + telephony stack

This folder documents the only part that cannot run inside a normal Vercel deployment: the machine physically connected to the SIM/phone line and the local voice models.

## Components

- **Asterisk**: originates and controls GSM/SIM calls through your configured channel (for the initial MVP this can be `chan_mobile` + Bluetooth on Linux where supported).
- **Voxora Telephony Bridge**: private HTTP service between the web dashboard and Asterisk ARI.
- **Whisper.cpp**: local speech-to-text.
- **Ollama + Qwen**: local conversation model.
- **Piper**: local Arabic text-to-speech.

No paid AI/telephony SaaS is required. Your mobile operator/SIM plan still carries the actual phone call.

## Expected bridge contract

Set Voxora web env:

```env
TELEPHONY_BACKEND_URL=http://<bridge-host>:8099
TELEPHONY_API_SECRET=<long-random-shared-secret>
```

The local bridge must expose:

```text
POST /agent/start
POST /agent/pause
POST /agent/stop
GET  /agent/status
POST /calls                 body: { id, name, phone, campaignId? }
POST /calls/:id/hangup
POST /calls/:id/transfer    body: { destination }
GET  /calls/:id/transcript
GET  /calls/:id/recording
GET  /health
```

Every endpoint should require `Authorization: Bearer <TELEPHONY_API_SECRET>` except a local-only health check if desired.

## AI services

Recommended environment values:

```env
LLM_URL=http://127.0.0.1:11434
LLM_MODEL=qwen3:4b
ASR_URL=http://127.0.0.1:8090
TTS_URL=http://127.0.0.1:8091
TTS_VOICE=ar_JO-kareem-medium
```

Run `scripts/setup-local-ai.sh` on a Linux/Ubuntu machine to install/pull the LLM and prepare the open-source voice directories. Review commands before running them.

## Real call test order

1. Verify Asterisk can originate a normal call through the SIM **without AI**.
2. Verify the Voxora local bridge can start/hang up that call.
3. Test against a number you own/control.
4. Add live audio capture → Whisper.cpp.
5. Add LLM response generation.
6. Add Piper audio injection.
7. Only then enable Sales `إضافة إلى البوت` for real leads.

Do not enable autonomous bulk calling before the single-call audio path and opt-out handling are verified.
