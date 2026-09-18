# Shared portability helpers for macOS, Linux and Windows (Git Bash / MSYS2 / Cygwin).
# Sourced by install.sh and export.sh; not executable on its own.

# Resolve the pi agent home the same way pi does.
pi_agent_home() {
  if [ -n "${PI_CODING_AGENT_DIR:-}" ]; then printf '%s\n' "$PI_CODING_AGENT_DIR"
  elif [ -n "${PI_AGENT_HOME:-}" ]; then printf '%s\n' "$PI_AGENT_HOME"
  else printf '%s\n' "$HOME/.pi/agent"
  fi
}

pi_os() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin) echo macos ;;
    Linux) if grep -qi microsoft /proc/version 2>/dev/null; then echo wsl; else echo linux; fi ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}

# First working Python 3 interpreter, or empty.
pi_python() {
  for c in python3 python py; do
    if command -v "$c" >/dev/null 2>&1; then
      if [ "$c" = py ]; then
        py -3 -c 'import sys; sys.exit(0)' >/dev/null 2>&1 && { echo "py -3"; return 0; }
      elif "$c" -c 'import sys; sys.exit(0 if sys.version_info[0]==3 else 1)' >/dev/null 2>&1; then
        echo "$c"; return 0
      fi
    fi
  done
  return 1
}

# venv layout differs on Windows: Scripts/foo.exe instead of bin/foo
pi_venv_bin() { # $1 = venv root
  if [ -d "$1/Scripts" ]; then printf '%s\n' "$1/Scripts"; else printf '%s\n' "$1/bin"; fi
}
pi_venv_exe() { # $1 = venv root, $2 = tool name
  local d; d="$(pi_venv_bin "$1")"
  if [ -x "$d/$2" ]; then printf '%s\n' "$d/$2"
  elif [ -f "$d/$2.exe" ]; then printf '%s\n' "$d/$2.exe"
  else printf '%s\n' "$d/$2"
  fi
}

# Can this shell create real symlinks? Git Bash needs developer mode or admin.
pi_symlinks_work() {
  local d t
  d="$(mktemp -d)" || return 1
  : > "$d/target"
  if ln -s "$d/target" "$d/link" 2>/dev/null && [ -L "$d/link" ]; then t=0; else t=1; fi
  rm -rf "$d"
  return $t
}
