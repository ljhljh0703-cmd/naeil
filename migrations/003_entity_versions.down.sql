-- 003 되돌리기: 행과 연결을 보존하고 추가한 판 번호만 제거한다.
ALTER TABLE milestones DROP COLUMN version;
ALTER TABLE projects DROP COLUMN version;
