# 켜기와 자료 파일 자리

## 켜는 법
| 명령 | 언제 |
|---|---|
| `npm start` | 평소. 서버와 화면을 굽고 구운 판(`node dist/server.js`)으로 켠다 |
| `npm run serve` | 굽지 않고 바로 켜 볼 때 (개발용) |
| `npm run dev` | 코드를 고치면서 (바꾸면 다시 켜짐) |
| `npm run smoke` | 구운 판이 저장소 밖 폴더에서도 켜지는지 확인. 실제 자료는 건드리지 않음 |

구운 판은 어느 폴더에서 켜도 같은 파일을 쓴다.
- 설정: 저장소 뿌리의 `.env`. 이미 있는 환경 변수가 먼저다 (자동 실행 설정에 적은 값이 `.env` 보다 우선)
- 표 구조 파일, 명세서, 화면 파일: 저장소 뿌리 기준

## 맥에서 늘 켜 두기 (자동 실행)
```bash
cd "<저장소 폴더>"
npm ci
npm run deploy:mac        # = bash scripts/macos/deploy.sh
bash scripts/macos/status.sh
```
배포 스크립트는 저장소에서 굽고, 실행에 필요한 것만 「라이브러리/Application Support/naeil/releases/<판>」 에 복사한 뒤 `current` 를 그 판으로 바꾼다.
저장소가 다운로드, 문서, 데스크탑 폴더 안에 있으면 맥이 자동 실행 프로그램의 접근을 막기 때문에, 서버는 저장소가 아닌 이 복사본에서 돈다.
저장소에서 코드를 고치거나 AI 세션이 작업해도 켜진 서버는 다음 배포 전까지 그대로다.

| 상황 | 자동 실행이 하는 일 |
|---|---|
| 맥에 로그인 | 켬 |
| 서버가 죽음 (0 이 아닌 종료, 강제 종료) | 10초 안쪽에 다시 켬 |
| 켜진 채 자료 파일이 다른 파일(백업본)로 바뀜 | 서버가 30초 안에 스스로 꺼지고(종료 75), 다시 켜지면서 새 파일을 엶 |
| 켜진 채 자료 파일이 지워짐 | 끄지 않음. 상태 확인 503 `missing` 을 유지 (다시 켜면 빈 작업판이 새로 생겨 정상처럼 보이므로) |
| 사람이 끔 (`launchctl kill TERM`, 종료 0) | 다시 켜지 않음 |

| 명령 | 하는 일 |
|---|---|
| `bash scripts/macos/status.sh` | 판, 자료 파일, 등록 상태, 다시 켜진 횟수, 상태 확인 답 |
| `bash scripts/macos/rollback.sh` | 바로 전 판으로 되돌림 (자료 파일은 그대로) |
| `bash scripts/macos/restore.sh <latest\|파일>` | 백업에서 되살리기 (아래 「백업과 되살리기」) |
| `bash scripts/macos/uninstall.sh` | 자동 실행(서버, 매일 백업) 해제. 판, 자료 파일, 백업은 남김 |

- 새 판은 바꿔 끼우기 전에 그 판 안에서 연기 시험을 돌린다. 실패하면 지금 판은 그대로 둔다
- 바꿔 끼운 뒤 20초 안에 상태 확인이 200 이 안 되면 이전 판으로 되돌리고 실패로 끝난다
- 판은 셋만 남긴다
- 처음 배포할 때 자료 파일이 없고 저장소에 예전 `data/naeil.db` 가 있으면 SQLite 백업으로 「복사」한다. 원본은 그대로
- 자동 실행 설정에는 node 절대경로를 적는다(자동 실행은 셸의 PATH 를 모른다). node 를 바꾸거나 올렸으면 다시 배포한다
- 기록: `~/Library/Logs/naeil/server.log`, `server.err.log`
- 출입증은 배포본 자료 파일에 만든다: `NAEIL_DB="$HOME/Library/Application Support/naeil/naeil.db" npm run key -- new author` (예전 자료를 복사했다면 그 안의 출입증이 그대로 통함)
- 배포해 둔 동안 저장소에서 `npm start` 를 하면 같은 3700 포트를 두고 부딪힌다. 개발할 때는 `NAEIL_PORT=3701 npm run serve` 처럼 다른 포트로

## 백업과 되살리기
| 언제 | 무엇이 |
|---|---|
| 매일 새벽 4시 17분 (잠자고 있었으면 깨어날 때) | 백업 → 그 백업으로 복원 연습 → 14개만 남기고 정리 (`com.naeil.backup`) |
| 배포할 때마다 | 바꿔 끼우기 전에 같은 일. 실패하면 배포를 멈춤 |
| 손으로 | `node "$HOME/Library/Application Support/naeil/current/dist/cli/backup.js" run` (저장소에서는 `npm run backup -- run`) |

- 자리: `~/Library/Application Support/naeil/backups/naeil-<세계 표준시>.db` 와 기록표 `.json` (크기, 지문, 줄 수, 표 구조 판)
- 켜진 서버가 쓰는 중에도 뜬다 (SQLite 백업). 곁 파일 없이 파일 하나로 끝난다
- 복원 연습은 백업을 임시 폴더에 되살려 앱으로 열어 본다: 무결성, 지문, 줄 수, 폐기한 출입증이 막히는지, 상태 확인, 프로젝트 목록. 실제 자료는 건드리지 않는다. 결과는 `backups/last-drill.json`
- 상태 확인 `checks.backup`: `ok`(36시간 안 백업, 마지막 연습 통과), `stale`, `none`, `failed`. 알리기만 하고 `ok` 에는 넣지 않는다
- 보관 개수: `NAEIL_BACKUP_KEEP` (기본 14). 자리: `NAEIL_BACKUP_DIR`

### 되살리기 (맥)
```bash
bash scripts/macos/restore.sh latest                        # 가장 최근 백업
bash scripts/macos/restore.sh naeil-20261110T041700Z.db     # 고른 백업
```
서버를 끄고(끄라는 신호라 다시 켜지지 않음), 지금 자료를 `backups/before-restore-<시각>/` 으로 **옮겨 두고**(지우지 않음), 백업을 제자리에 놓고, 폐기 명부를 다시 적용한 뒤 켠다. 서버가 켜져 있으면 되살리기 명령은 거절한다.

### 폐기한 출입증은 되살려도 막힌 채로
폐기하기 전에 뜬 백업 안에서는 그 출입증이 아직 살아 있다. 그래서 폐기할 때 자료 파일 「밖」의 폐기 명부(`revoked-keys.json`, 자료 파일 옆)에도 적고, 서버를 켤 때와 되살릴 때마다 명부를 다시 적용한다.
- 명부에는 잠근 값(sha256)과 이름, 시각만. 출입증 원문은 없다
- 명부가 생기기 전에 폐기한 것은 켤 때 자료에서 명부로 옮겨 적는다
- 명부 파일을 지우면 이 보호가 사라진다. 백업과 같이 지우지 말 것

## 자료 파일은 어디에
켤 때 기록 첫머리에 `자료 파일` 줄로 찍힌다. 정하는 순서는 아래와 같다.

| 순서 | 조건 | 쓰는 파일 |
|---|---|---|
| 1 | `NAEIL_DB` 가 절대경로 | 그 파일 |
| 2 | `NAEIL_DB` 가 상대경로 | 저장소 뿌리 기준으로 읽은 파일 (켤 때 알림) |
| 3 | `NAEIL_DB` 가 없고 저장소 안 `data/naeil.db` 가 있음 | 그 파일 (예전 기본값. 켤 때 옮기기 권함) |
| 4 | 둘 다 없음 (맥 자동 실행은 늘 1번: 자동 실행 설정에 절대경로를 적음) | 맥 `~/Library/Application Support/naeil/naeil.db`, 리눅스 `~/.local/share/naeil/naeil.db`, 윈도우 `%APPDATA%\naeil\naeil.db` |

저장소 밖에 두는 이유: 같은 컴퓨터에서 저장소 폴더를 여는 AI 세션이 자료 파일을 직접 열거나 지울 수 있다. 아이클라우드 동기화 폴더(문서, 데스크탑)는 반쯤 받은 파일을 열 수 있어 피한다.

### 예전 자리에서 옮기기 (맥)
서버를 끈 뒤, 자료 파일과 곁 파일 두 개(`-wal`, `-shm`)를 같이 옮긴다. 하나라도 빠지면 마지막 변경이 사라질 수 있다.
```bash
set -e
cd "<저장소 폴더>"
mkdir -p "$HOME/Library/Application Support/naeil"
for f in data/naeil.db data/naeil.db-wal data/naeil.db-shm; do
  [ -e "$f" ] && mv "$f" "$HOME/Library/Application Support/naeil/"
done
```
`.env` 에 `NAEIL_DB=data/naeil.db` 줄이 있으면 지우거나 새 절대경로로 바꾼 뒤 켠다. 켠 뒤 기록의 `자료 파일` 줄과 화면의 작업 수를 확인한다.

## 상태 확인 (`GET /health`)
자동 재시작과 알림은 이 답만 본다. 출입증 없이 열린다.

| 답 | 뜻 | 할 일 |
|---|---|---|
| 200 `db: ok` | 살아 있고 자료가 읽힘 | 없음 |
| 503 `db: missing` | 켜진 채 자료 파일이 사라짐. 서버는 옛 파일을 붙들고 있음 | 파일을 되살리고 다시 켜기 |
| 503 `db: replaced` | 켜진 채 다른 파일(예: 백업본)로 바뀜 | 다시 켜면 새 파일을 연다 |
| 503 `db: error` | 자료를 읽지 못함 | 기록 확인 |
| `web: missing` | 화면을 굽지 않고 켬. API 는 열림 | `npm run build` 후 다시 켜기 |
