-- 007 되돌리기: 스위치, 이어하기 칸, 결정함을 뺀다. 할 일과 멈춤 상태는 그대로
DROP TABLE settings;
ALTER TABLE tasks DROP COLUMN progress_note;
ALTER TABLE milestones DROP COLUMN done_when;
DROP INDEX decisions_open_one;
DROP INDEX decisions_task;
DROP TABLE decisions;
