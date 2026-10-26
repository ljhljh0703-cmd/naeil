-- 002 되돌리기
ALTER TABLE tasks DROP COLUMN version;
ALTER TABLE change_log DROP COLUMN session;
DROP TABLE idempotency_keys;
DROP INDEX api_keys_active_name;
DROP TABLE api_keys;
