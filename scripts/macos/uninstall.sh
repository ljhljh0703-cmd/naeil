#!/bin/bash
# 자동 실행(서버, 매일 백업)을 끄고 설정 파일만 지운다. 판(releases), 자료 파일(naeil.db), 백업은 남긴다
set -euo pipefail
AGENTS_DIR="${NAEIL_LAUNCH_AGENTS:-$HOME/Library/LaunchAgents}"
for LABEL in com.naeil.server com.naeil.backup; do
  if [ "$(uname -s)" = "Darwin" ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  fi
  if [ -e "${AGENTS_DIR:?}/${LABEL:?}.plist" ]; then rm "${AGENTS_DIR:?}/${LABEL:?}.plist"; fi
done
echo "자동 실행 해제. 자료, 백업, 판은 「${NAEIL_APP_HOME:-$HOME/Library/Application Support/naeil}」 에 그대로"
