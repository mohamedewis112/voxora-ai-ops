#!/usr/bin/env bash
set -euo pipefail

ROOT="${VOXORA_LOCAL_ROOT:-$HOME/voxora-local}"
ENV_FILE="$ROOT/voxora-local.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run: bash scripts/setup-local-ai.sh" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$ROOT/logs" "$ROOT/run"

if ! curl -fsS --max-time 2 "$LLM_URL/api/tags" >/dev/null 2>&1; then
  nohup ollama serve >"$ROOT/logs/ollama.log" 2>&1 &
  echo $! >"$ROOT/run/ollama.pid"
  sleep 2
fi

WHISPER_SERVER="$ROOT/whisper.cpp/build/bin/whisper-server"
if [ ! -x "$WHISPER_SERVER" ]; then
  echo "Whisper server not built: $WHISPER_SERVER" >&2
  exit 1
fi
if [ ! -f "$WHISPER_MODEL_PATH" ]; then
  echo "Whisper model missing: $WHISPER_MODEL_PATH" >&2
  exit 1
fi

if ! curl -fsS --max-time 2 "$ASR_URL" >/dev/null 2>&1; then
  nohup "$WHISPER_SERVER" --host 0.0.0.0 --port 8090 -m "$WHISPER_MODEL_PATH"     >"$ROOT/logs/whisper.log" 2>&1 &
  echo $! >"$ROOT/run/whisper.pid"
fi

PIPER_PY="$ROOT/piper-venv/bin/python"
if [ ! -x "$PIPER_PY" ]; then
  echo "Piper venv missing. Run setup-local-ai.sh first." >&2
  exit 1
fi
if ! curl -fsS --max-time 2 "$TTS_URL/voices" >/dev/null 2>&1; then
  nohup "$PIPER_PY" -m piper.http_server     -m "$TTS_VOICE" --data-dir "$PIPER_DATA" --host 0.0.0.0 --port 8091     >"$ROOT/logs/piper.log" 2>&1 &
  echo $! >"$ROOT/run/piper.pid"
fi

echo "Voxora local AI services started:"
echo "  Ollama:  $LLM_URL ($LLM_MODEL)"
echo "  Whisper: $ASR_URL ($WHISPER_MODEL)"
echo "  Piper:   $TTS_URL ($TTS_VOICE)"
echo "Logs: $ROOT/logs"
