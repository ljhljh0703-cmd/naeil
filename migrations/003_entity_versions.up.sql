-- 003 프로젝트·마일스톤에도 선택 If-Match를 위한 판 번호를 둔다.
-- 기존 행은 1로 시작한다. 하위 항목이나 연결은 바꾸지 않는다.
ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE milestones ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
