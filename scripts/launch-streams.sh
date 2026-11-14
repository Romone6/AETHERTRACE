#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
launch=false
if [[ "${1:-}" == "--launch" ]]; then launch=true; fi
streams=(science frontend validation infrastructure)
branches=(scientific-data frontend validation infrastructure)
for i in "${!streams[@]}"; do
  stream="${streams[$i]}"
  branch="feat/${branches[$i]}"
  dir="$root/../aethertrace-${stream}"
  if [[ ! -e "$dir/.git" ]]; then
    git -C "$root" worktree add -b "$branch" "$dir" main
  fi
  if $launch; then
    log="/tmp/aethertrace-${stream}.log"
    nohup codex exec --cd "$dir" --sandbox workspace-write --add-dir "$root" - < "$root/prompts/stream-${stream}.md" >"$log" 2>&1 &
    printf '%s pid=%s log=%s
' "$stream" "$!" "$log"
  else
    printf 'codex exec --cd "%s" --sandbox workspace-write - < "%s/prompts/stream-%s.md"
' "$dir" "$root" "$stream"
  fi
done
