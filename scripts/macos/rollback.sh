#!/bin/bash
# 바로 전 판으로 되돌린다. 자료 파일은 그대로 (표 구조를 되돌리지는 않는다)
set -euo pipefail
APP_HOME="${NAEIL_APP_HOME:-$HOME/Library/Application Support/naeil}"
LABEL="com.naeil.server"
CUR="$(readlink "$APP_HOME/current" 2>/dev/null || true)"
[ -n "$CUR" ] || { echo "지금 판이 없음" >&2; exit 1; }
PREV="$(ls -1d "$APP_HOME/releases"/*/ 2>/dev/null | sed 's#/$##' | sort | grep -v -x -F "$CUR" | tail -n 1 || true)"
[ -n "$PREV" ] || { echo "되돌릴 이전 판이 없음" >&2; exit 1; }
ln -sfn "$PREV" "$APP_HOME/current"
echo "되돌림: $(basename "$CUR") → $(basename "$PREV")"
if [ "$(uname -s)" = "Darwin" ]; then
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
  for _ in $(seq 1 40); do curl -sf "http://127.0.0.1:${NAEIL_PORT:-3700}/health" >/dev/null && break; sleep 0.5; done
  curl -s "http://127.0.0.1:${NAEIL_PORT:-3700}/health"; echo
fi
