#!/usr/bin/env bash
set -euo pipefail

# Voxora local AI bootstrap for Ubuntu/Linux.
# It does NOT configure Asterisk/SIM automatically because Bluetooth/SIM hardware differs.

if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y curl
fi

if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

ollama pull "${LLM_MODEL:-qwen3:4b}"

sudo apt-get update
sudo apt-get install -y git build-essential cmake ffmpeg python3 python3-venv

ROOT="${VOXORA_LOCAL_ROOT:-$HOME/voxora-local}"
mkdir -p "$ROOT"

if [ ! -d "$ROOT/whisper.cpp/.git" ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$ROOT/whisper.cpp"
fi
cmake -S "$ROOT/whisper.cpp" -B "$ROOT/whisper.cpp/build" -DWHISPER_BUILD_SERVER=ON
cmake --build "$ROOT/whisper.cpp/build" -j"$(nproc)"

cat <<MSG

Voxora local AI base is prepared.

Ollama model: ${LLM_MODEL:-qwen3:4b}
Whisper.cpp: $ROOT/whisper.cpp

Next:
1. Download a Whisper model appropriate for your hardware.
2. Run whisper-server on ASR_URL (default expected by Voxora: port 8090).
3. Install/run Piper and Arabic voice '${TTS_VOICE:-ar_JO-kareem-medium}' behind a small HTTP TTS service on port 8091.
4. Configure Asterisk + your SIM/Bluetooth channel and the Voxora telephony bridge.

See local-stack/README.md.
MSG
