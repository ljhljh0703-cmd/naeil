-- 007 이어하기 + 결정함 + 기능 스위치 (M1-4)
-- ① 결정함: 「내 결정 기다림」에 질문, 선택지, 추천, 근거, 고른 답을 남긴다. 기다리던 세션이 답을 읽는다 (2026-11-13 검토)
CREATE TABLE decisions (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'me',
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  question     TEXT NOT NULL,
  options      TEXT NOT NULL DEFAULT '[]', -- 선택지 목록 (JSON)
  recommended  TEXT,
  basis        TEXT,
  asked_by     TEXT NOT NULL,
  asked_at     TEXT NOT NULL,
  answer       TEXT,
  note         TEXT,
  answered_by  TEXT,
  answered_at  TEXT
);
CREATE INDEX decisions_task ON decisions (workspace_id, task_id, asked_at);
-- 한 할 일에 열린(답 없는) 결정은 하나만
CREATE UNIQUE INDEX decisions_open_one ON decisions (workspace_id, task_id) WHERE answered_at IS NULL;

-- ② 이어하기 한 장의 재료: 마일스톤 「끝나면」, 할 일 「어디까지 했나」 한 줄
ALTER TABLE milestones ADD COLUMN done_when TEXT;
ALTER TABLE tasks ADD COLUMN progress_note TEXT;

-- ③ 기능 스위치: 화면만 숨기고 경계 규칙은 늘 적용. 마지막으로 누가 왜 바꿨는지 남긴다
CREATE TABLE settings (
  workspace_id TEXT NOT NULL DEFAULT 'me',
  name         TEXT NOT NULL,
  enabled      INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  reason       TEXT,
  changed_by   TEXT NOT NULL,
  changed_kind TEXT,
  changed_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id, name)
);
