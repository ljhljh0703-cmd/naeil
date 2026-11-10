#!/bin/bash
# naeil 을 맥에 배포하고, 로그인하면 켜지고 죽으면 다시 켜지게 한다 (launchd).
#
#   cd "<저장소 폴더>" && npm ci && bash scripts/macos/deploy.sh
#
# 하는 일 (순서대로, 한 단계라도 실패하면 멈춘다)
#   1) Node 확인     지금 셸의 node 가 .node-version 이상인지
#   2) 굽기          npm run build (서버와 화면)
#   3) 판 만들기     실행에 필요한 것만 「라이브러리/Application Support/naeil/releases/<판>」 에 복사
#                    저장소(다운로드 폴더)는 맥이 자동 실행 프로그램의 접근을 막는 폴더라 거기서 직접 켜지 않는다
#   4) 판 시험       새 판을 빈 폴더, 빈 자료로 켜 연기 시험 (실제 자료는 건드리지 않음)
#   5) 첫 자료       자료 파일이 아직 없고 저장소에 예전 자료(data/naeil.db)가 있으면 「복사」 (원본은 그대로)
#   6) 바꿔 끼우기   current 를 새 판으로
#   7) 자동 실행     ~/Library/LaunchAgents/com.naeil.server.plist 를 쓰고 다시 켬
#   8) 확인          상태 확인이 200 이 될 때까지 기다림. 안 되면 이전 판으로 되돌리고 실패로 끝남
#
# 바꿀 수 있는 값 (환경 변수)
#   NAEIL_NODE=/경로/node      쓸 node (기본: 지금 셸의 node)
#   NAEIL_PORT=3700            포트
#   NAEIL_DEPLOY_SKIP_BUILD=1  굽기 건너뛰기 (이미 구웠을 때)
#   NAEIL_APP_HOME, NAEIL_LAUNCH_AGENTS, NAEIL_LOG_DIR  시험용 자리 바꾸기
set -euo pipefail

say() { printf '\n== %s\n' "$*"; }
die() { printf '\n실패: %s\n' "$*" >&2; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_HOME="${NAEIL_APP_HOME:-$HOME/Library/Application Support/naeil}"
AGENTS_DIR="${NAEIL_LAUNCH_AGENTS:-$HOME/Library/LaunchAgents}"
LOG_DIR="${NAEIL_LOG_DIR:-$HOME/Library/Logs/naeil}"
LABEL="com.naeil.server"
PLIST="$AGENTS_DIR/$LABEL.plist"
PORT="${NAEIL_PORT:-3700}"
DB="$APP_HOME/naeil.db"
IS_MAC=0; [ "$(uname -s)" = "Darwin" ] && IS_MAC=1

cd "$REPO"

say "1) Node 확인"
NODE="${NAEIL_NODE:-$(command -v node || true)}"
[ -n "$NODE" ] && [ -x "$NODE" ] || die "node 를 못 찾음. NAEIL_NODE=/경로/node 로 알려 주세요"
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"
WANT="$(tr -d ' \n\r' < .node-version)"
"$NODE" -e '
  const p = (v) => v.replace(/^v/, "").split(".").map(Number);
  const [a, b] = [p(process.version), p(process.argv[1])];
  const d = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (a[0] !== b[0] || d < 0) { console.error(`node ${process.version} 는 맞지 않음. ${process.argv[1]} 이상, 같은 큰 번호`); process.exit(1); }
' "$WANT" || die "Node 판이 맞지 않음"
echo "node: $NODE ($("$NODE" -v))"
case "$NODE" in
  "$HOME/Downloads/"*|"$HOME/Documents/"*|"$HOME/Desktop/"*) die "node 가 맥이 막는 폴더(다운로드, 문서, 데스크탑) 안에 있음. 다른 node 를 NAEIL_NODE 로" ;;
esac

say "2) 굽기"
if [ "${NAEIL_DEPLOY_SKIP_BUILD:-}" = "1" ]; then
  echo "건너뜀"
else
  [ -d node_modules ] || die "node_modules 가 없음. npm ci 먼저"
  npm run build
fi
[ -f dist/server.js ] && [ -f web/dist/index.html ] || die "구운 결과가 없음 (dist/server.js, web/dist/index.html)"

say "3) 판 만들기"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
DIRTY=""; git diff --quiet HEAD 2>/dev/null || DIRTY="-dirty"
REL_ID="$(date +%Y%m%d-%H%M%S)-$SHA$DIRTY"
REL="$APP_HOME/releases/$REL_ID"
mkdir -p "$APP_HOME/releases" "$LOG_DIR"
mkdir "$REL"
cp package.json package-lock.json .node-version "$REL/"
cp -R dist migrations "$REL/"
mkdir -p "$REL/docs/api" "$REL/web" "$REL/scripts"
cp docs/api/openapi.yaml "$REL/docs/api/"
cp -R web/dist "$REL/web/dist"
cp scripts/smoke-dist.mjs "$REL/scripts/"
# 꾸러미는 인터넷에서 다시 받지 않고 복사한 뒤 개발용만 뺀다 (사내망, 폐쇄망에서도 같은 방법)
cp -R node_modules "$REL/node_modules"
(cd "$REL" && npm prune --omit=dev --no-audit --no-fund >/dev/null)
printf '%s\n' "$REL_ID" > "$REL/RELEASE"
echo "판: $REL_ID"

say "4) 판 시험 (빈 자료, 빈 폴더)"
"$NODE" "$REL/scripts/smoke-dist.mjs" || { rm -rf "$REL"; die "새 판 연기 시험 실패. 판을 지우고 멈춤 (지금 켜진 판은 그대로)"; }

say "5) 자료 파일"
if [ -e "$DB" ]; then
  echo "그대로 씀: $DB"
elif [ -e "$REPO/data/naeil.db" ]; then
  # 곁 파일(-wal)까지 한 번에 맞춰 복사한다(SQLite 백업). 원본은 지우지 않는다
  (cd "$REL" && "$NODE" -e '
    const Database = require("better-sqlite3");
    const src = new Database(process.argv[1], { readonly: true, fileMustExist: true });
    src.backup(process.argv[2]).then(() => src.close()).catch((e) => { console.error(e.message); process.exit(1); });
  ' "$REPO/data/naeil.db" "$DB") || die "예전 자료 복사 실패"
  echo "예전 자료를 복사함: $REPO/data/naeil.db → $DB (원본 그대로)"
else
  echo "자료 파일 없음. 처음 켤 때 새로 만듦: $DB"
fi

say "6) 바꿔 끼우기"
PREV=""
[ -L "$APP_HOME/current" ] && PREV="$(readlink "$APP_HOME/current")"
ln -sfn "$REL" "$APP_HOME/current"
echo "지금 판: $REL_ID${PREV:+ (이전: $(basename "$PREV"))}"

say "7) 자동 실행 설정"
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
mkdir -p "$AGENTS_DIR"
cat > "$PLIST.tmp" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(esc "$NODE")</string>
    <string>$(esc "$APP_HOME/current/dist/server.js")</string>
  </array>
  <key>WorkingDirectory</key><string>$(esc "$APP_HOME/current")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NAEIL_HOST</key><string>127.0.0.1</string>
    <key>NAEIL_PORT</key><string>$PORT</string>
    <key>NAEIL_DB</key><string>$(esc "$DB")</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$(esc "$LOG_DIR/server.log")</string>
  <key>StandardErrorPath</key><string>$(esc "$LOG_DIR/server.err.log")</string>
</dict>
</plist>
EOF
mv "$PLIST.tmp" "$PLIST"
if [ "$IS_MAC" = "1" ]; then
  plutil -lint "$PLIST" >/dev/null || die "자동 실행 설정 파일 모양이 틀림: $PLIST"
  DOMAIN="gui/$(id -u)"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  # 내린 직후에는 다시 올리기가 잠깐 실패할 수 있어 몇 번 더 해 본다. 올리면 RunAtLoad 로 바로 켜진다
  booted=0
  for _ in 1 2 3 4 5; do
    if launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then booted=1; break; fi
    sleep 1
  done
  [ "$booted" = "1" ] || launchctl bootstrap "$DOMAIN" "$PLIST" || die "자동 실행 등록 실패"
else
  echo "맥이 아니라 자동 실행 등록은 건너뜀 (설정 파일만 씀: $PLIST)"
fi

say "8) 확인"
if [ "$IS_MAC" = "1" ]; then
  ok=0
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null; then ok=1; break; fi
    sleep 0.5
  done
  if [ "$ok" != "1" ]; then
    if [ -n "$PREV" ]; then
      ln -sfn "$PREV" "$APP_HOME/current"
      launchctl kickstart -k "$DOMAIN/$LABEL" || true
      die "새 판이 켜지지 않아 이전 판($(basename "$PREV"))으로 되돌림. 기록: $LOG_DIR/server.err.log"
    fi
    die "켜지지 않음. 기록: $LOG_DIR/server.err.log"
  fi
  curl -s "http://127.0.0.1:$PORT/health"; echo
fi

# 오래된 판은 셋만 남긴다 (지금 판과 이전 판은 늘 남음)
ALL="$(ls -1d "$APP_HOME/releases"/*/ 2>/dev/null | sed 's#/$##' | sort)"
COUNT="$(printf '%s\n' "$ALL" | grep -c . || true)"
if [ "$COUNT" -gt 3 ]; then
  printf '%s\n' "$ALL" | head -n "$((COUNT - 3))" | while read -r old; do
    [ "$old" = "$REL" ] || [ "$old" = "$PREV" ] || rm -rf "$old"
  done
fi

say "끝"
echo "주소: http://127.0.0.1:$PORT   판: $REL_ID"
echo "상태 보기: bash scripts/macos/status.sh"
