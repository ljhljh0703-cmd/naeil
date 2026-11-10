#!/bin/bash
# 백업에서 되살린다: 서버 끄기 → 지금 자료를 옆 폴더로 옮기고 백업을 제자리에 → 폐기 명부 다시 적용 → 서버 켜기
#   bash scripts/macos/restore.sh latest
#   bash scripts/macos/restore.sh naeil-20261110T041700Z.db
# 백업 목록: node "$HOME/Library/Application Support/naeil/current/dist/cli/backup.js" list
set -euo pipefail
WHICH="${1:-}"
[ -n "$WHICH" ] || { echo "쓰는 법: bash scripts/macos/restore.sh <latest|백업 파일 이름>" >&2; exit 1; }
APP_HOME="${NAEIL_APP_HOME:-$HOME/Library/Application Support/naeil}"
PORT="${NAEIL_PORT:-3700}"
DB="$APP_HOME/naeil.db"
LABEL="com.naeil.server"
DOMAIN="gui/$(id -u)"
PLIST="${NAEIL_LAUNCH_AGENTS:-$HOME/Library/LaunchAgents}/$LABEL.plist"
NODE="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$PLIST" 2>/dev/null || command -v node)"
CLI="$APP_HOME/current/dist/cli/backup.js"
[ -f "$CLI" ] || { echo "배포본이 없음: $CLI" >&2; exit 1; }

echo "== 서버 끄기 (끄라는 신호 → 0 으로 끝나 자동 실행이 다시 켜지 않음)"
launchctl kill TERM "$DOMAIN/$LABEL" 2>/dev/null || true
for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/health" || break
  sleep 0.5
done
if curl -s -o /dev/null "http://127.0.0.1:$PORT/health"; then
  echo "서버가 꺼지지 않아 멈춤" >&2; exit 1
fi

echo "== 되살리기"
if ! NAEIL_DB="$DB" NAEIL_HOST=127.0.0.1 NAEIL_PORT="$PORT" "$NODE" "$CLI" restore "$WHICH"; then
  # 되살리기는 중간에 실패하면 원래 자료를 제자리로 되돌린다. 그래도 자료 파일이 없으면 켜지 않는다
  # (켜면 빈 자료 파일이 새로 생겨 빈 작업판이 정상처럼 보임)
  if [ -e "$DB" ]; then
    echo "되살리기 실패. 원래 자료 그대로 서버를 다시 켭니다" >&2
    launchctl kickstart "$DOMAIN/$LABEL" || true
  else
    echo "되살리기 실패, 자료 파일이 제자리에 없어 서버를 켜지 않습니다. $APP_HOME/backups/before-restore-* 를 확인하세요" >&2
  fi
  exit 1
fi

echo "== 서버 켜기"
launchctl kickstart "$DOMAIN/$LABEL"
for _ in $(seq 1 40); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 0.5; done
curl -s "http://127.0.0.1:$PORT/health"; echo
