#!/bin/bash
# 자동 실행을 끄고 설정 파일만 지운다. 판(releases)과 자료 파일(naeil.db)은 남긴다
set -euo pipefail
LABEL="com.naeil.server"
PLIST="${NAEIL_LAUNCH_AGENTS:-$HOME/Library/LaunchAgents}/$LABEL.plist"
if [ "$(uname -s)" = "Darwin" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
fi
[ -e "$PLIST" ] && rm "$PLIST"
echo "자동 실행 해제. 자료와 판은 「${NAEIL_APP_HOME:-$HOME/Library/Application Support/naeil}」 에 그대로"
