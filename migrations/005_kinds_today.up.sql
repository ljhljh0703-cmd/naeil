-- 005 바닥 묶음 (M1-7, 2026-11-13 Fable 검토)
-- ① 출입증 종류: 사람(human), AI(ai), 자동 검사(ci). 「AI 가 바꿨다」 표시와 나중 권한표가 이 칸에 기댄다.
--    기존 출입증은 사람으로 두고, 이름이 claude, codex 인 것만 AI 로 본다.
ALTER TABLE api_keys ADD COLUMN kind TEXT NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'ai', 'ci'));
UPDATE api_keys SET kind = 'ai' WHERE name IN ('claude', 'codex');

-- ② 변경 기록에 그때 출입증 종류를 같이 남긴다. 기존 줄은 같은 이름 출입증의 종류로 채운다.
ALTER TABLE change_log ADD COLUMN actor_kind TEXT;
UPDATE change_log SET actor_kind = (
  SELECT k.kind FROM api_keys k
  WHERE k.workspace_id = change_log.workspace_id AND k.name = change_log.actor
  ORDER BY k.created_at DESC LIMIT 1
);
CREATE INDEX change_log_entity ON change_log (workspace_id, entity, entity_id, id);

-- ③ 서버가 주는 오늘: 「오늘은 이거」 고정과 건너뛰기를 날짜별로 서버에 둔다 (전에는 브라우저 안에만).
CREATE TABLE day_state (
  workspace_id   TEXT NOT NULL DEFAULT 'me',
  day            TEXT NOT NULL,              -- 한국 날짜 YYYY-MM-DD
  pinned_task_id TEXT,
  skipped        TEXT NOT NULL DEFAULT '[]', -- 할 일 번호 목록 (JSON)
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (workspace_id, day)
);
