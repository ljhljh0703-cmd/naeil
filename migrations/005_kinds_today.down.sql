-- 005 되돌리기: 오늘 고정과 건너뛰기, 기록의 종류 칸, 출입증 종류 칸을 뺀다. 할 일과 기록 줄은 그대로.
DROP TABLE day_state;
DROP INDEX change_log_entity;
ALTER TABLE change_log DROP COLUMN actor_kind;
ALTER TABLE api_keys DROP COLUMN kind;
