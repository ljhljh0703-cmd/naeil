#!/bin/bash
# naeil 자동 실행 상태 한눈에: 켜져 있나, 몇 번 다시 켜졌나, 어느 판인가, 상태 확인 답
set -uo pipefail
APP_HOME="${NAEIL_APP_HOME:-$HOME/Library/Application Support/naeil}"
LOG_DIR="${NAEIL_LOG_DIR:-$HOME/Library/Logs/naeil}"
PORT="${NAEIL_PORT:-3700}"
LABEL="com.naeil.server"

echo "판:       $(cat "$APP_HOME/current/RELEASE" 2>/dev/null || echo '없음 (deploy.sh 를 먼저)')"
echo "자료:     $APP_HOME/naeil.db $( [ -e "$APP_HOME/naeil.db" ] && echo '(있음)' || echo '(없음)')"
if [ "$(uname -s)" = "Darwin" ]; then
  info="$(launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null || true)"
  if [ -z "$info" ]; then
    echo "자동 실행: 등록 안 됨"
  else
    echo "자동 실행: 등록됨"
    printf '%s\n' "$info" | grep -E '^[[:space:]]*(state|pid|runs|last exit code) =' | sed 's/^[[:space:]]*/  /'
  fi
fi
if out="$(curl -s -w '  (HTTP %{http_code})' "http://127.0.0.1:$PORT/health")"; then
  echo "상태 확인: $out"
else
  echo "상태 확인: 연결 안 됨 (포트 $PORT)"
fi
echo "기록:     $LOG_DIR/server.log, $LOG_DIR/server.err.log"
