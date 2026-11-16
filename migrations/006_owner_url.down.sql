-- 006 되돌리기: 할 일은 그대로 두고 몫과 원본 주소 칸만 뺀다
ALTER TABLE tasks DROP COLUMN source_seen;
ALTER TABLE tasks DROP COLUMN source_url;
ALTER TABLE tasks DROP COLUMN owner;
