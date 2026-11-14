#!/usr/bin/env bash
set -euo pipefail

# Voxora local AI bootstrap for Ubuntu/Linux.
# Installs the local LLM, ASR model/server, and Arabic TTS voice.
# Asterisk/SIM remains hardware-specific and is configured separately.

LLM_MODEL="${LLM_MODEL:-qwen3:4b}"
WHISPER_MODEL="${WHISPER_MODEL:-small}"
TTS_VOICE="${TTS_VOICE:-ar_JO-kareem-medium}"
ROOT="${VOXORA_LOCAL_ROOT:-$HOME/voxora-local}"
WHISPER_DIR="$ROOT/whisper.cpp"
WHISPER_MODELS="$ROOT/whisper-models"
PIPER_VENV="$ROOT/piper-venv"
PIPER_DATA="$ROOT/piper-voices"

sudo apt-get update
sudo apt-get install -y curl git build-essential cmake ffmpeg python3 python3-venv python3-pip

mkdir -p "$ROOT" "$WHISPER_MODELS" "$PIPER_DATA"

if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Start Ollama only if it is not already reachable.
if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  nohup ollama serve >"$ROOT/ollama.log" 2>&1 &
  sleep 2
fi
ollama pull "$LLM_MODEL"

if [ ! -d "$WHISPER_DIR/.git" ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$WHISPER_DIR"
else
  git -C "$WHISPER_DIR" pull --ff-only
fi

cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" -DWHISPER_BUILD_SERVER=ON
cmake --build "$WHISPER_DIR/build" -j"$(nproc)"
bash "$WHISPER_DIR/models/download-ggml-model.sh" "$WHISPER_MODEL" "$WHISPER_MODELS"

if [ ! -x "$PIPER_VENV/bin/python" ]; then
  python3 -m venv "$PIPER_VENV"
fi
"$PIPER_VENV/bin/python" -m pip install --upgrade pip
"$PIPER_VENV/bin/python" -m pip install --upgrade 'piper-tts[http]'
"$PIPER_VENV/bin/python" -m piper.download_voices --data-dir "$PIPER_DATA" "$TTS_VOICE"

cat > "$ROOT/voxora-local.env" <<ENV
LLM_URL=http://127.0.0.1:11434
LLM_MODEL=$LLM_MODEL
ASR_URL=http://127.0.0.1:8090
WHISPER_MODEL=$WHISPER_MODEL
WHISPER_MODEL_PATH=$WHISPER_MODELS/ggml-$WHISPER_MODEL.bin
TTS_URL=http://127.0.0.1:8091
TTS_VOICE=$TTS_VOICE
PIPER_DATA=$PIPER_DATA
ENV

cat <<MSG

Voxora local AI base is ready.

LLM:     $LLM_MODEL via Ollama
ASR:     Whisper.cpp $WHISPER_MODEL
TTS:     Piper $TTS_VOICE
Config:  $ROOT/voxora-local.env

Run:
  bash scripts/start-local-ai.sh

Then configure Asterisk + your SIM/Bluetooth channel and:
  node local-stack/telephony-bridge.mjs

Important: the telephony bridge controls calls. Real-time phone audio ↔ STT/LLM/TTS
still requires the dedicated media worker/Asterisk ExternalMedia path; the bridge
does not claim voice AI is active until that worker is connected.
MSG
