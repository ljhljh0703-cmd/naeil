-- 002 명세서 v1 작가 결정 4곳을 표로 옮긴다 (2026-10-25)
-- ① 도구별 출입증: 키 원문은 저장하지 않고 잠근 값(sha256)만. 같은 이름의 살아 있는 키는 하나만.
-- ② 같은 요청 두 번 막기: 처음 응답을 24시간 보관해 같은 열쇠로 다시 오면 그대로 돌려준다.
-- ③ 세션 이름표: 변경 기록에 session 칸.
-- ④ 덮어쓰기 막기: 할 일에 판 번호(version). 고칠 때마다 1씩 오르고 ETag 로 나간다.

CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'me',
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  revoked_at   TEXT
);

CREATE UNIQUE INDEX api_keys_active_name
  ON api_keys (workspace_id, name)
  WHERE revoked_at IS NULL;

CREATE TABLE idempotency_keys (
  workspace_id  TEXT NOT NULL DEFAULT 'me',
  key_name      TEXT NOT NULL,
  idem_key      TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status_code   INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  location      TEXT,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, key_name, idem_key)
);

ALTER TABLE change_log ADD COLUMN session TEXT;

ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
