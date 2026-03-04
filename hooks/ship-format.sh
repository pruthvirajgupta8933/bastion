#!/bin/bash
set -euo pipefail

# ShipKit Auto-Format Hook — NON-JS languages only
# ECC's post-edit-format.js handles JS/TS/JSON/CSS/HTML
# This hook covers: Python, Go, Swift, Rust

# ── Read stdin (hook JSON input) ─────────────────────────────────────────────

INPUT=""
while IFS= read -r -t 2 line; do
  INPUT="${INPUT}${line}"
done

if [ -z "$INPUT" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

# Extract file_path from tool_input
FILE_PATH=$(echo "$INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\(.*\)"/\1/')

if [ -z "$FILE_PATH" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

if [ ! -f "$FILE_PATH" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

# ── Determine extension and format ───────────────────────────────────────────

EXT="${FILE_PATH##*.}"
EXT=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

# Helper: run a command with a timeout (macOS-compatible)
run_with_timeout() {
  local timeout_secs="$1"
  shift
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$timeout_secs" "$@" || true
  elif command -v timeout >/dev/null 2>&1; then
    timeout "$timeout_secs" "$@" || true
  else
    "$@" &
    local pid=$!
    (sleep "$timeout_secs" && kill "$pid" 2>/dev/null) &
    local watchdog=$!
    wait "$pid" 2>/dev/null || true
    kill "$watchdog" 2>/dev/null || true
  fi
}

format_file() {
  case "$EXT" in
    # SKIP JS/TS — ECC's post-edit-format.js handles these
    ts|tsx|js|jsx|json|css|scss|html)
      return 0
      ;;
    py)
      if command -v black >/dev/null 2>&1; then
        run_with_timeout 5 black --quiet "$FILE_PATH" >/dev/null 2>&1
      elif command -v autopep8 >/dev/null 2>&1; then
        run_with_timeout 5 autopep8 --in-place "$FILE_PATH" >/dev/null 2>&1
      fi
      ;;
    go)
      if command -v gofmt >/dev/null 2>&1; then
        run_with_timeout 5 gofmt -w "$FILE_PATH" >/dev/null 2>&1
      fi
      ;;
    swift)
      if command -v swiftformat >/dev/null 2>&1; then
        run_with_timeout 5 swiftformat "$FILE_PATH" >/dev/null 2>&1
      fi
      ;;
    rs)
      if command -v rustfmt >/dev/null 2>&1; then
        run_with_timeout 5 rustfmt "$FILE_PATH" >/dev/null 2>&1
      fi
      ;;
  esac
}

# Run formatting — best-effort, never block
format_file || true

# Always allow — formatting is best-effort
echo '{"decision":"allow"}'
