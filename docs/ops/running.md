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

## 자료 파일은 어디에
켤 때 기록 첫머리에 `자료 파일` 줄로 찍힌다. 정하는 순서는 아래와 같다.

| 순서 | 조건 | 쓰는 파일 |
|---|---|---|
| 1 | `NAEIL_DB` 가 절대경로 | 그 파일 |
| 2 | `NAEIL_DB` 가 상대경로 | 저장소 뿌리 기준으로 읽은 파일 (켤 때 알림) |
| 3 | `NAEIL_DB` 가 없고 저장소 안 `data/naeil.db` 가 있음 | 그 파일 (예전 기본값. 켤 때 옮기기 권함) |
| 4 | 둘 다 없음 | 맥 `~/Library/Application Support/naeil/naeil.db`, 리눅스 `~/.local/share/naeil/naeil.db`, 윈도우 `%APPDATA%\naeil\naeil.db` |

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
