# 오류 종류

naeil API의 오류는 전부 한 가지 모양(`application/problem+json`, RFC 9457)으로 나간다.

```json
{
  "type": "https://github.com/ljhljh0703-cmd/naeil/blob/main/docs/errors.md#version-mismatch",
  "title": "그 사이 다른 곳에서 먼저 고침",
  "status": 412,
  "detail": "다시 읽고(GET) 새 ETag 로 고치세요",
  "instance": "/v1/tasks/…"
}
```

`type` 끝의 이름이 아래 제목과 같다.

## bad-input
400. 입력이 명세서 규칙과 다름. 명세서에 없는 칸을 보냈거나, 번호 모양이 틀렸거나, 없는 프로젝트에 할 일을 만들려고 함.

## unauthorized
401. `Authorization: Bearer <API 키>` 이 없거나 틀리거나 폐기됨. 응답 머리말 `WWW-Authenticate: Bearer`.

## forbidden
403. 열 수 없는 파일 (화면 파일 밖).

## forbidden-for-key-kind
403. 이 API 키 종류로는 부를 수 없는 동작 (권한표, M2-1). 동작마다 부를 수 있는 종류가 명세서 `x-naeil-who` 에 있다. AI 키는 프로젝트 휴지통과 복원, 결정 답하기를 못 하고, 자동 검사(ci) 키는 읽기만 한다.

## open-decision
422. 작가에게 묻고 있는 질문이 있는 할 일을 AI 가 끝내려 함. 답을 받은 뒤 다시.

## not-found
404. 없거나 휴지통에 있음. 휴지통에 있는 할 일은 `POST /v1/tasks/{taskId}/revive` 로 복원한다.

## method-not-allowed
405. 이 주소에서 쓸 수 없는 방법.

## duplicate-import
409. 같은 출처(`source` + `sourceRef`)의 할 일이 이미 있음. 깃허브 이슈를 두 번 가져올 때.

## version-mismatch
412. `If-Match` 로 보낸 판 표시가 지금 판과 다름. 그 사이 다른 세션이 먼저 고쳤다. 다시 읽고 고친다.

## too-large
413. 보낸 내용이 너무 큼 (1MB 넘음).

## unsupported-type
415. 받지 않는 내용 종류. 본문은 `application/json` 으로.

## idempotency-key-reused
422. 같은 `Idempotency-Key` 를 다른 내용으로 다시 보냄. 내용이 다르면 새 열쇠를 쓴다.

## blocked-done
422. 끝난 일에는 멈춘 이유를 붙이지 않는다.

## held-by-not-ai
422. 잡은 세션(`heldBy`)은 「AI 작업 중」(`ai_working`)일 때만.

## server
500. 서버 오류. 서버 기록을 확인한다.
