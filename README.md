# 내일은내일 (naeil)

> **내 일은 naeil에서**
> AI 세션을 여러 개 오가도 어제 한 일을 잃지 않는 1인 개발자 작업판

## 지금 상태
- ⏳ 단계 1/9 · 첫 기능: 할 일·프로젝트·마일스톤 API + 오늘 화면
- 오늘 화면 4칸: 마지막에 한 일 · 지금 할 것 1개 · 내가 정할 것 · 마감 가까운 것
- 누를 수 있는 카드 + 오른쪽 옆 상세 패널 · 오늘 화면 전체 보기 / 집중 보기
- 마일스톤 화면: 프로젝트마다 마일스톤 진행 막대, 다음 마일스톤 강조, 마일스톤 없는 할 일 모음
- API 명세서 `docs/api/openapi.yaml` (19개 동작 모두 구현)

## 처음 한 번
```bash
cd naeil
npm ci
cp .env.example .env          # 데이터베이스 위치 등. 아이클라우드 동기화 폴더 밖으로
npm run key -- new author     # 화면용 출입증. 한 번만 보이니 바로 복사
```

## 켜기
```bash
npm start                     # 화면을 굽고 서버를 켠다 → http://127.0.0.1:3700
```
처음 열면 출입증 칸이 나온다. 위에서 복사한 `nk_…` 를 붙여 넣는다.

## 출입증 (도구마다 1장)
| 명령 | 하는 일 |
|---|---|
| `npm run key -- new author` | 화면용 |
| `npm run key -- new claude` | Claude 세션용 |
| `npm run key -- new codex` | Codex 세션용 |
| `npm run key -- revoke <이름>` | 폐기 (잃어버렸거나 바꿀 때) |
| `npm run key -- list` | 목록 (키 원문은 다시 못 봄) |

- 서버에는 키 원문 대신 잠근 값(해시)만 남는다
- AI 세션은 요청 머리말에 `Authorization: Bearer <키>` 와 세션 이름표 `X-Naeil-Session: session-3` 를 붙인다
- 「누가 바꿨나」는 서버가 출입증을 보고 정한다

## API 한눈에
| 주소 | 하는 일 |
|---|---|
| `GET /health` | 살아 있나 (출입증 없이) |
| `GET·POST /v1/projects` · `GET·PATCH·DELETE /v1/projects/{id}` | 프로젝트 목록·만들기·보기·이름 변경·휴지통 |
| `GET·POST /v1/projects/{id}/milestones` | 마일스톤 목록(마감 빠른 순, 마감 없음 뒤)·만들기 |
| `PATCH·DELETE /v1/milestones/{id}` | 마일스톤 이름·마감 변경·휴지통 |
| `GET·POST /v1/tasks` | 할 일 목록(거르기·커서) · 만들기(`Idempotency-Key` 로 두 번 막기) |
| `GET·PATCH·DELETE /v1/tasks/{id}` | 보기(`ETag`) · 고치기(`If-Match` 선택) · 휴지통 |
| `PUT·DELETE /v1/tasks/{id}/block` | 멈춤 걸기 · 풀기 |
| `POST /v1/tasks/{id}/revive` | 되살리기 |
| `GET /v1/changes` | 변경 기록 (읽기만) |

프로젝트는 GET 응답의 `ETag`, 마일스톤은 목록 항목의 `etag`를 PATCH 요청의 `If-Match`에 넣으면 오래된 내용으로 덮어쓰는 일을 막는다. 생략하면 검사 없이 고친다. 프로젝트 휴지통은 프로젝트만 옮기며, 하위 할 일·마일스톤은 그대로 둔다.

오류는 전부 한 가지 모양(`application/problem+json`). 종류는 `docs/errors.md`.

## 만들 때
```bash
npm run dev          # 서버 (코드 바꾸면 다시 켜짐)
npm run dev:web      # 화면 (http://127.0.0.1:5173, API는 3700으로 넘김)
npm run check        # 코드 검사 + 타입 검사 + 시험 + 화면 굽기
npm run lint:api     # 명세서 검사
```
- 서버 입력 검사는 명세서에서 그대로 읽는다. 규칙을 코드에 두 번 적지 않는다
- 시험이 모든 응답을 명세서와 대조한다 (번호 · 내용 종류 · 본문 모양 · 약속한 머리말)
- 표 구조 변경은 `migrations/` 에 올리기·되돌리기 파일로

## 만드는 순서
| 단계 | 내용 |
|---|---|
| 0 | 바탕: 저장소, 검사 장치 |
| 1 | 내 맥에서 일정·마일스톤 관리 |
| 2 | 사내망 배포 (맥 + 개인 VPN) |
| 3 | AI 창 연결 (MCP) |
| 4 | 할 일 출처 붙이기 (깃허브 이슈 → 슬랙 → 지라) |
| 5 | 지시 내리기 |
| 6 | 맥 앱 포장 |
| 7 | 다른 사람도 쓰게 |
| 8 | 기억·학습·인지 부담 줄이기 |

## 지키는 것
- 비밀 키는 저장소에 올리지 않는다 (`.env` 는 올라가지 않음, 올리기 검사 있음)
- 실제 할 일 데이터는 저장소에 넣지 않는다. 예시 데이터만
- 서버는 기본으로 이 컴퓨터 안에서만 열린다

## 라이선스
MIT
