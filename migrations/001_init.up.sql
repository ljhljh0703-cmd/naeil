-- 001 처음 표 4개: 프로젝트 · 마일스톤 · 할 일 · 변경 기록
-- 모든 표에 workspace_id(누구 것인가)를 둔다. 지금은 'me' 하나지만 단계 7에서 표를 다시 짜지 않으려고.
-- 시간은 전부 세계 표준시(UTC) ISO 문자열로 저장한다. 화면에서 한국 시간으로 바꿔 보여 준다.
-- 지우기는 deleted_at 을 채우는 휴지통 방식. 진짜 삭제는 따로.

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'me',
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE milestones (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'me',
  project_id   TEXT NOT NULL REFERENCES projects(id),
  name         TEXT NOT NULL,
  due_at       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL DEFAULT 'me',
  project_id     TEXT NOT NULL REFERENCES projects(id),
  milestone_id   TEXT REFERENCES milestones(id),
  title          TEXT NOT NULL,
  -- 진행 3개
  status         TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  -- 멈춘 이유 4개. 멈췄을 때만 채운다. 끝난 일에는 붙지 않는다.
  blocked_reason TEXT CHECK (blocked_reason IN ('my_decision', 'ai_working', 'external', 'tech')),
  -- 「AI가 하는 중」일 때 잡고 있는 세션 (예: claude, codex)
  held_by        TEXT,
  due_at         TEXT,
  -- 어디서 왔나: 직접 만든 것 / 깃허브 이슈 등. 같은 것을 두 번 가져와도 하나만 남게 source + source_ref 를 묶어 둔다.
  source         TEXT NOT NULL DEFAULT 'direct',
  source_ref     TEXT,
  -- 바깥(이슈·제보)에서 온 글이면 1. AI가 이 글을 지시로 받아들이지 않게 표시해 둔다.
  external_text  INTEGER NOT NULL DEFAULT 0 CHECK (external_text IN (0, 1)),
  body           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  CHECK (blocked_reason IS NULL OR status <> 'done'),
  CHECK (held_by IS NULL OR blocked_reason = 'ai_working')
);

CREATE UNIQUE INDEX tasks_source_unique
  ON tasks (workspace_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

-- 변경 기록. 「누가」에 나중에 AI 세션 이름이 들어오면 「마지막에 뭘 했나」 자료가 된다.
CREATE TABLE change_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL DEFAULT 'me',
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  entity       TEXT NOT NULL CHECK (entity IN ('project', 'milestone', 'task')),
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  details      TEXT
);

CREATE INDEX change_log_recent ON change_log (workspace_id, at DESC);
